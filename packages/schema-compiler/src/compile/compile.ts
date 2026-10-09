// The programmatic entry point: one compilation run, from settings to the
// written Destination Directory. The CLI and any future bundler plugin wrap it.
import path from 'node:path';
import type { SettingOverrides, Settings } from '../config/config.js';
import { SettingsResolver } from '../config/settingsResolver.js';
import { promoteDiagnosticsSeverity } from '../diagnostics/createDiagnostic.js';
import { hasError, type Diagnostic } from '../diagnostics/diagnostic.js';
import { DestinationWriter, type Destination } from './destinationWriter.js';
import { mirrorScannedFiles } from './mirror/mirror.js';
import {
  createNoInputFilesDiagnostic,
  findScanningInputFilePaths,
  type ScanScope,
} from './scan.js';

/**
 * What a {@link compile} run reports.
 *
 * @example
 * ```ts
 * import { compile } from '@pvl/schema-compiler';
 *
 * const { diagnostics, written, destination } = await compile({ cwd: process.cwd() });
 * if (written) console.log(`wrote ${destination}`);
 * ```
 */
export type CompilePayload = {
  /** Every diagnostic, errors and warnings alike, in the order they were found. */
  diagnostics: Diagnostic[];
  /** The merged settings, or `undefined` when they couldn't be resolved. */
  settings: Settings | undefined;
  /** The Destination Directory's absolute path, once settings resolved. */
  destination: string | undefined;
  /** Whether the Destination Directory was written. Never `true` when an error fired. */
  written: boolean;
};

type CreateCompilePayloadArgs = Pick<CompilePayload, 'settings' | 'destination' | 'written'> & {
  diagnostics: ReadonlyArray<Diagnostic>;
  strict: boolean;
};

/**
 * Builds the {@link CompilePayload} a {@link compile} run reports, at any
 * point of the run.
 *
 * Handles:
 * - `strict`: every warning is promoted to an error, so the caller's
 *   `hasError` check then stops the run before anything is written. An
 *   error stays an error, so promoting twice changes nothing.
 * - Without `strict`: the diagnostics are copied unchanged, so later pushes to
 *   the caller's array don't leak into the payload.
 *
 * Reports: the `settings`, `destination` and `written` as given. `settings`
 * and `destination` are `undefined` when the settings couldn't be resolved.
 *
 * Ignores: whether an error is present. Deciding to write or bail is
 * {@link compile}'s job, so it never sets `written` itself.
 *
 * ```ts
 * createCompilePayload({ diagnostics: [<warning>], settings, destination, written: false, strict: true })
 * // { diagnostics: [<the warning as an error>], settings, destination, written: false }
 * createCompilePayload({ diagnostics: [], settings, destination, written: true, strict: false })
 * // { diagnostics: [], settings, destination, written: true }
 * ```
 */
const createCompilePayload = ({
  diagnostics,
  settings,
  destination,
  written,
  strict,
}: CreateCompilePayloadArgs): CompilePayload => {
  return {
    diagnostics: strict ? promoteDiagnosticsSeverity(diagnostics) : [...diagnostics],
    settings,
    destination,
    written,
  };
};

/**
 * What {@link compile} runs with.
 *
 * @example
 * ```ts
 * import { compile, type CompileArgs } from '@pvl/schema-compiler';
 *
 * const args: CompileArgs = { cwd: process.cwd(), configPath: 'apps/web/pvlconfig.json' };
 * await compile(args);
 * ```
 */
export type CompileArgs = {
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
 * Runs one compilation: resolves the settings (overrides, then
 * `pvlconfig.json`, then defaults), scans the files `include` selects and
 * writes the Destination Directory. Nothing is written when any error fired.
 * Problems come back as diagnostics; it doesn't throw for them.
 *
 * @example
 * ```ts
 * import { compile, hasError } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await compile({
 *   cwd: process.cwd(),
 *   overrides: { destination: 'src/generated' },
 * });
 * const failed = hasError(diagnostics);
 * ```
 */
export const compile = async ({
  cwd,
  configPath,
  overrides = {},
  strict = false,
}: CompileArgs): Promise<CompilePayload> => {
  const resolvedSettingsPayload = await SettingsResolver.resolveSettings({
    cwd: path.resolve(cwd),
    configPath,
    overrides,
  });

  if (resolvedSettingsPayload.settings === undefined) {
    return createCompilePayload({
      diagnostics: resolvedSettingsPayload.diagnostics,
      settings: undefined,
      destination: undefined,
      written: false,
      strict,
    });
  }

  const { settings, baseDirectory } = resolvedSettingsPayload;
  const destination: Destination = DestinationWriter.resolveDestination(baseDirectory, settings);
  const rootDirectory = path.resolve(baseDirectory, settings.rootDir);

  const scanScope: ScanScope = {
    baseDirectory,
    include: settings.include,
    destination: destination.absolutePath,
  };

  //TODO: filesand and checkDestination could be in a Promise.all()

  const foundDiagnostics: Diagnostic[] = [
    ...DestinationWriter.checkDestinationNotIncluded({ include: settings.include, destination }),
    ...(await DestinationWriter.checkDestination(destination.absolutePath)),
  ];

  const filePaths = await findScanningInputFilePaths(scanScope);
  if (filePaths.length === 0) {
    foundDiagnostics.push(createNoInputFilesDiagnostic(settings.include));
  }

  const mirroredScannedFiles = mirrorScannedFiles({
    scannedFilePaths: filePaths,
    baseDirectory,
    rootDirectory,
    destination: destination,
  });

  foundDiagnostics.push(...mirroredScannedFiles.diagnostics);

  if (hasError(foundDiagnostics)) {
    return createCompilePayload({
      diagnostics: foundDiagnostics,
      settings,
      destination: destination.absolutePath,
      written: false,
      strict,
    });
  }

  const { isWritten, diagnostics: writeDestinationDiagnostics } =
    await DestinationWriter.writeDestination({
      destination,
      mirroredFiles: mirroredScannedFiles.mirroredFiles,
    });

  return createCompilePayload({
    diagnostics: [...foundDiagnostics, ...writeDestinationDiagnostics],
    settings,
    destination: destination.absolutePath,
    written: isWritten,
    strict,
  });
};
