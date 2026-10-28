// The programmatic entry point: one compilation run, from settings to the
// written Destination Directory. It prepares the run and collects every
// diagnostic, hands the scanned modules to `compileAll`, then writes what it
// returns. The CLI and any future bundler plugin wrap it.
import * as path from 'node:path';
import { resolveConfig } from '../config/configResolver.js';
import type { PvlConfigOverrides } from '../config/types.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { isErrorInDiagnostics, promoteAllDiagnostics } from '../diagnostics/utils.js';
import { compileAll } from './compileAll.js';
import { DestinationWriter } from '../destination/destinationWriter.js';
import { TsMorphProject } from '../tsMorphProject/tsMorphProject.js';
import { Precheck } from '../precheck/precheck.js';
import { Module } from '../module/module.js';
import { Scanner } from '../scanner/scanner.js';
import { findMarkedToCompileSchemas } from '../schemas/readSchema.js';
import type { CompilationOutput } from './types.js';

/**
 * Whether `diagnostics` stop the run before anything is written: any error
 * does, and under `strict` any warning too; warnings alone let it go ahead
 * otherwise.
 *
 * ```ts
 * isRunStoppedBy([PARSE_FAILED], false)         // true
 * isRunStoppedBy([FILE_EXPORTS_NOTHING], false) // false: a warning
 * isRunStoppedBy([FILE_EXPORTS_NOTHING], true)  // true
 * ```
 */
const isRunStoppedBy = (diagnostics: ReadonlyArray<Diagnostic>, strict: boolean): boolean => {
  return isErrorInDiagnostics(diagnostics) || (strict && diagnostics.length > 0);
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
 * 3. collects the destination checks' diagnostics and each scanned module's
 *    precheck, and stops there when the precheck stops the run;
 * 4. reads each scanned module's `pvl.compile(...)` calls;
 * 5. unless an error fired, compiles every scanned module with `compileAll`
 *    and writes the Destination Directory.
 *
 * Nothing is written when any error fired, or under `strict` any warning,
 * which then comes back as an error. Problems come back as diagnostics; it
 * doesn't throw for them.
 *
 * @example
 * ```ts
 * import { runCompilation, isErrorInDiagnostics } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await runCompilation({
 *   cwd: process.cwd(),
 *   overrides: { destination: 'src/generated' },
 * });
 * const failed = isErrorInDiagnostics(diagnostics);
 * ```
 */
export const runCompilation = async (args: RunCompilationArgs): Promise<CompilationOutput> => {
  const payload = await runCompilationWithoutPromoting(args);
  // Promoted here, once, so every warning comes back as an error whichever
  // step the run returned from.
  return args.strict === true
    ? { ...payload, diagnostics: promoteAllDiagnostics(payload.diagnostics) }
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
  const resolvedSettingsPayload = await resolveConfig({
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

  const [destinationDiagnostics, { scannedFilePaths, diagnostics: scanDiagnostics }] =
    await Promise.all([
      DestinationWriter.checkDestination(destination.absolutePath),
      Scanner.scan({ baseDirectory, include: rawSettings.include, destination }),
    ]);

  // What `include` and the destination raise before any file is read.
  const scanScopeDiagnostics: Diagnostic[] = [...scanDiagnostics, ...destinationDiagnostics];

  const tsMorphProjectPayload = TsMorphProject.create(baseDirectory);
  // Without a project, no file can be read, so TSCONFIG_UNREADABLE is
  // reported alone, before any scanned module.
  if (tsMorphProjectPayload.tsMorphProject === undefined) {
    return {
      diagnostics: [...scanScopeDiagnostics, ...tsMorphProjectPayload.diagnostics],
      settings: rawSettings,
      destination: destination.absolutePath,
      written: false,
    };
  }
  const { tsMorphProject } = tsMorphProjectPayload;

  const modules = scannedFilePaths.map(
    (scannedFilePath) =>
      new Module({ scannedFilePath, tsMorphProject, rootDirectory, destination }),
  );
  const precheckDiagnostics = Precheck.precheckModules({ modules });

  // A precheck that stops the run stops it before any `pvl.compile(...)` call
  // is read. PARSE_FAILED is an error, so past this point every scanned
  // module parsed.
  if (isRunStoppedBy(precheckDiagnostics, strict)) {
    return {
      diagnostics: [...scanScopeDiagnostics, ...precheckDiagnostics],
      settings: rawSettings,
      destination: destination.absolutePath,
      written: false,
    };
  }

  const compilations = modules.map((module) => findMarkedToCompileSchemas(module));

  const diagnostics = [
    ...scanScopeDiagnostics,
    ...precheckDiagnostics,
    ...compilations.flatMap((compilation) => compilation.diagnostics),
  ];

  if (isRunStoppedBy(diagnostics, strict)) {
    return {
      diagnostics,
      settings: rawSettings,
      destination: destination.absolutePath,
      written: false,
    };
  }

  const mirroredFiles = compileAll({
    compilations,
    withTypes: rawSettings.withTypes,
  });

  const { isWritten, diagnostics: writeDestinationDiagnostics } =
    await DestinationWriter.writeDestination({ destination, mirroredFiles });

  return {
    diagnostics: [...diagnostics, ...writeDestinationDiagnostics],
    settings: rawSettings,
    destination: destination.absolutePath,
    written: isWritten,
  };
};
