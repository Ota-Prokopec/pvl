// The programmatic entry point: one compilation run, from settings to the
// written Destination Directory. It prepares the run and collects every
// diagnostic, hands the scanned modules to `compileAll`, then writes what it
// returns. The CLI and any future bundler plugin wrap it.
import path from 'node:path';
import type { SettingOverrides, Settings } from '../config/config.js';
import { SettingsResolver } from '../config/configResolver.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { Diagnostics } from '../diagnostics/diagnostics.js';
import { compileAll } from './compileAll.js';
import { Destination } from '../destination/destination.js';
import { DestinationWriter } from '../destination/destinationWriter.js';
import { DIAGNOSTIC_CODE } from '../enums.js';
import { findPatternsMatchingPath } from '../utils.js';
import { Module } from './mirror/module.js';
import { TsMorphProject } from './mirror/tsMorphProject.js';
import {
  precheckScannedModules,
  type PrecheckScannedModulesPayload,
} from './precheckScannedModules.js';
import { createNoInputFilesDiagnostic, findScanningInputFilePaths } from './scan.js';

/**
 * What a {@link runCompilation} run reports.
 *
 * @example
 * ```ts
 * import { runCompilation } from '@pvl/schema-compiler';
 *
 * const { diagnostics, written, destination } = await runCompilation({ cwd: process.cwd() });
 * if (written) console.log(`wrote ${destination}`);
 * ```
 */
export type RunCompilationPayload = {
  /** Every diagnostic, errors and warnings alike, in the order they were found. */
  diagnostics: Diagnostic[];
  /** The merged settings, or `undefined` when they couldn't be resolved. */
  settings: Settings | undefined;
  /** The Destination Directory's absolute path, once settings resolved. */
  destination: string | undefined;
  /** Whether the Destination Directory was written. Never `true` when an error fired. */
  written: boolean;
};

type CreateRunCompilationPayloadArgs = Pick<
  RunCompilationPayload,
  'settings' | 'destination' | 'written'
> & {
  diagnostics: ReadonlyArray<Diagnostic>;
  strict: boolean;
};

/**
 * Builds the {@link RunCompilationPayload} a {@link runCompilation} run
 * reports, at any point of the run.
 *
 * Handles:
 * - `strict`: every warning is promoted to an error, so the caller's
 *   `Diagnostics.hasError` check then stops the run before anything is written. An
 *   error stays an error, so promoting twice changes nothing.
 * - Without `strict`: the diagnostics are copied unchanged, so later pushes to
 *   the caller's array don't leak into the payload.
 *
 * Reports: the `settings`, `destination` and `written` as given. `settings`
 * and `destination` are `undefined` when the settings couldn't be resolved.
 *
 * Ignores: whether an error is present. Deciding to write or bail is
 * {@link runCompilation}'s job, so it never sets `written` itself.
 *
 * ```ts
 * createRunCompilationPayload({ diagnostics: [<warning>], settings, destination, written: false, strict: true })
 * // { diagnostics: [<the warning as an error>], settings, destination, written: false }
 * createRunCompilationPayload({ diagnostics: [], settings, destination, written: true, strict: false })
 * // { diagnostics: [], settings, destination, written: true }
 * ```
 */
const createRunCompilationPayload = ({
  diagnostics,
  settings,
  destination,
  written,
  strict,
}: CreateRunCompilationPayloadArgs): RunCompilationPayload => {
  return {
    diagnostics: strict ? Diagnostics.promote(diagnostics) : [...diagnostics],
    settings,
    destination,
    written,
  };
};

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
    message: `The destination ${destination.relative.path} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
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
export type RunCompilationArgs = {
  /** The working directory: where `pvlconfig.json` is looked for, and the base directory without one. */
  cwd: string;
  /** The config file, relative to `cwd`. Defaults to `pvlconfig.json` in `cwd`, which may be absent. */
  configPath?: string;
  /** Settings that win over the config file. */
  overrides?: SettingOverrides;
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
 * Nothing is written when any error fired. Problems come back as
 * diagnostics; it doesn't throw for them.
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
export const runCompilation = async ({
  cwd,
  configPath,
  overrides = {},
  strict = false,
}: RunCompilationArgs): Promise<RunCompilationPayload> => {
  const resolvedSettingsPayload = await SettingsResolver.resolveSettings({
    cwd: path.resolve(cwd),
    configPath,
    overrides,
  });

  if (resolvedSettingsPayload.settings === undefined) {
    return createRunCompilationPayload({
      diagnostics: resolvedSettingsPayload.diagnostics,
      settings: undefined,
      destination: undefined,
      written: false,
      strict,
    });
  }

  const { settings, baseDirectory } = resolvedSettingsPayload;
  const destination = Destination.resolveDestination(baseDirectory, settings);
  const rootDirectory = path.resolve(baseDirectory, settings.rootDir);

  const [destinationDiagnostics, scannedFilePaths] = await Promise.all([
    DestinationWriter.checkDestination(destination.absolutePath),
    findScanningInputFilePaths({ baseDirectory, include: settings.include, destination }),
  ]);

  const { tsMorphProject, diagnostics: tsMorphProjectDiagnostics } =
    TsMorphProject.create(baseDirectory);

  // Without a project, no file can be read, so TSCONFIG_UNREADABLE is
  // reported alone, before any scanned module.
  const { diagnostics: scannedModulesDiagnostics, compilations }: PrecheckScannedModulesPayload =
    tsMorphProject === undefined
      ? { diagnostics: [], compilations: [] }
      : precheckScannedModules({
          tsMorphProject,
          scannedModules: Module.readAll({
            tsMorphProject,
            scannedFilePaths,
            rootDirectory,
            destination,
          }),
          rootDirectory,
        });

  const foundDiagnostics: Diagnostic[] = [
    ...findPatternsMatchingPath(settings.include, destination.relative.path).map((pattern) =>
      createDestinationInsideIncludeDiagnostic(destination, pattern),
    ),
    ...destinationDiagnostics,
    ...(scannedFilePaths.length === 0 ? [createNoInputFilesDiagnostic(settings.include)] : []),
    ...tsMorphProjectDiagnostics,
    ...scannedModulesDiagnostics,
  ];

  // Built before the error check, so `strict` has promoted every warning by then.
  const unwrittenPayload = createRunCompilationPayload({
    diagnostics: foundDiagnostics,
    settings,
    destination: destination.absolutePath,
    written: false,
    strict,
  });

  // Any error means nothing is compiled or written; warnings alone let the run
  // go ahead. A missing project always comes with TSCONFIG_UNREADABLE, and
  // PARSE_FAILED is an error, so past this point every scanned module parsed
  // and has its compilation.
  if (tsMorphProject === undefined || Diagnostics.hasError(unwrittenPayload.diagnostics)) {
    return unwrittenPayload;
  }

  const mirroredFiles = compileAll({ tsMorphProject, compilations });

  const { isWritten, diagnostics: writeDestinationDiagnostics } =
    await DestinationWriter.writeDestination({ destination, mirroredFiles });

  return createRunCompilationPayload({
    diagnostics: [...foundDiagnostics, ...writeDestinationDiagnostics],
    settings,
    destination: destination.absolutePath,
    written: isWritten,
    strict,
  });
};
