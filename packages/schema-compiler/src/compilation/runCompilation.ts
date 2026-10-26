// The programmatic entry point: one compilation run, from settings to the
// written Destination Directory. It prepares the run and collects every
// diagnostic, hands the scanned modules to `compileAll`, then writes what it
// returns. The CLI and any future bundler plugin wrap it.
import * as path from 'node:path';
import type { PvlConfig, PvlConfigOverrides } from '../config/config.js';
import { ConfigResolver } from '../config/configResolver.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { Diagnostics } from '../diagnostics/utils.js';
import { compileAll } from './compileAll.js';
import { Destination } from '../destination/destination.js';
import { DestinationWriter } from '../destination/destinationWriter.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { findPatternsMatchingPath } from '../utils.js';
import { TsMorphProject } from '../tsMorphProject.js';
import { Precheck } from '../precheck.js';
import { Scanner } from '../scanner.js';
import type { CompilationOutput } from './types.js';

/**
 * The DESTINATION_INSIDE_INCLUDE diagnostic for an `include` pattern that
 * matches the Destination Directory or anything inside it, so the compiler
 * would scan its own output.
 *
 * ```ts
 * // include: ['src/**\/*.ts'], destination: 'src/compiled'
 * createDestinationInsideIncludeDiagnostic(destination, 'src/**\/*.ts') // DESTINATION_INSIDE_INCLUDE
 * ```
 */
const createDestinationInsideIncludeDiagnostic = (
  destination: Destination,
  pattern: string,
): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
    message: `The destination ${destination.relativePath.pathFromBase} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
    file: destination.absolutePath,
  });
};

/**
 * What {@link runCompilation} runs with.
 *
 * @example
 * ```ts
 * import { runCompilation, type RunCompilationArgs } from '@pvl/schema-compiler';
 *
 * const args: RunCompilationArgs = { cwd: process.cwd(), configPath: 'apps/web/pvlconfig.json' };
 * await runCompilation(args);
 * ```
 */
type RunCompilationArgs = {
  /** The working directory: where `pvlconfig.json` is looked for, and the base directory without one. */
  cwd: string;
  /** The config file, relative to `cwd`. Defaults to `pvlconfig.json` in `cwd`, which may be absent. */
  configPath?: string;
  /** Settings that win over the config file. */
  overrides?: PvlConfigOverrides;
  /** Promotes every warning to an error. */
  strict?: boolean;
};

/**
 * Runs one compilation:
 *
 * 1. resolves the settings (overrides, then `pvlconfig.json`, then defaults),
 *    the Destination Directory and the Root Directory;
 * 2. creates the ts-morph project and reads into it the files `include` selects;
 * 3. collects every diagnostic, from the destination checks to each scanned
 *    module's precheck;
 * 4. unless an error fired, compiles every scanned module with `compileAll`
 *    and writes the Destination Directory.
 *
 * Nothing is written when any error fired, or under `strict` any warning,
 * which then comes back as an error. Problems come back as diagnostics; it
 * doesn't throw for them.
 *
 * @example
 * ```ts
 * import { runCompilation, Diagnostics } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await runCompilation({
 *   cwd: process.cwd(),
 *   overrides: { destination: 'src/generated' },
 * });
 * const failed = Diagnostics.hasError(diagnostics);
 * ```
 */
export const runCompilation = async (args: RunCompilationArgs): Promise<CompilationOutput> => {
  const payload = await runCompilationWithoutPromoting(args);
  // Promoted here, once, so every warning comes back as an error whichever
  // step the run returned from.
  return args.strict === true
    ? { ...payload, diagnostics: Diagnostics.promote(payload.diagnostics) }
    : payload;
};

/**
 * The {@link runCompilation} run, with every diagnostic left at its own
 * severity. `strict` only decides here that a warning stops the Destination
 * Directory from being written too; `runCompilation` promotes the warnings
 * once this returns.
 *
 * ```ts
 * // src/schemas/setup.ts exports nothing
 * runCompilationWithoutPromoting({ cwd, strict: false })
 * // { diagnostics: [FILE_EXPORTS_NOTHING, a warning], written: true, … }
 * runCompilationWithoutPromoting({ cwd, strict: true })
 * // { diagnostics: [FILE_EXPORTS_NOTHING, a warning], written: false, … }
 * ```
 */
const runCompilationWithoutPromoting = async ({
  cwd,
  configPath,
  overrides = {},
  strict = false,
}: RunCompilationArgs): Promise<CompilationOutput> => {
  const resolvedSettingsPayload = await ConfigResolver.resolveConfig({
    cwd: path.resolve(cwd),
    configPath,
    overrides,
  });

  if (!resolvedSettingsPayload.isResolved) {
    //TODO: this will throw an error in the future
    return {
      diagnostics: resolvedSettingsPayload.diagnostics,
      settings: undefined,
      destination: undefined,
      written: false,
    };
  }

  const { rawSettings, baseDirectory, destination } = resolvedSettingsPayload;
  const rootDirectory = path.resolve(baseDirectory, rawSettings.rootDir);

  const [destinationDiagnostics, scannedFilePaths] = await Promise.all([
    DestinationWriter.checkDestination(destination.absolutePath),
    Scanner.scan({ baseDirectory, include: rawSettings.include, destination }),
  ]);

  // What the destination and `include` raise before any file is read.
  const scanScopeDiagnostics: Diagnostic[] = [
    ...findPatternsMatchingPath(settings.include, destination.relativePath.pathFromBase).map(
      (pattern) => createDestinationInsideIncludeDiagnostic(destination, pattern),
    ),
    ...destinationDiagnostics,
    ...(scannedFilePaths.length === 0
      ? [Scanner.createNoInputFilesDiagnostic(settings.include)]
      : []),
  ];

  const tsMorphProjectPayload = TsMorphProject.create(baseDirectory);
  // Without a project, no file can be read, so TSCONFIG_UNREADABLE is
  // reported alone, before any scanned module.
  if (tsMorphProjectPayload.tsMorphProject === undefined) {
    return {
      diagnostics: [...scanScopeDiagnostics, ...tsMorphProjectPayload.diagnostics],
      settings,
      destination: destination.absolutePath,
      written: false,
    };
  }
  const { tsMorphProject } = tsMorphProjectPayload;

  const modules = Scanner.getModules({
    tsMorphProject,
    scannedFilePaths,
    rootDirectory,
    destination,
  });
  const { diagnostics: moduleDiagnostics, compilations } = Precheck.precheckModules({ modules });

  const diagnostics = [...scanScopeDiagnostics, ...moduleDiagnostics];

  // Any error means nothing is compiled or written, and so does any warning
  // under `strict`; warnings alone let the run go ahead otherwise.
  // PARSE_FAILED is an error, so past this point every scanned module parsed
  // and has its compilation.
  if (Diagnostics.hasError(diagnostics) || (strict && diagnostics.length > 0)) {
    return { diagnostics, settings, destination: destination.absolutePath, written: false };
  }

  const mirroredFiles = compileAll({
    tsMorphProject,
    compilations,
    withTypes: rawSettings.withTypes,
  });

  const { isWritten, diagnostics: writeDestinationDiagnostics } =
    await DestinationWriter.writeDestination({ destination, mirroredFiles });

  return {
    diagnostics: [...diagnostics, ...writeDestinationDiagnostics],
    settings,
    destination: destination.absolutePath,
    written: isWritten,
  };
};
