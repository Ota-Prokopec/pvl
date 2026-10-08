// The programmatic entry point: one compilation run, from settings to the
// written Destination Directory. The CLI and any future bundler plugin wrap it.
import { relative, resolve } from 'node:path';
import type { SettingOverrides, Settings } from '../config/config.js';
import { resolveSettings } from '../config/settings.js';
import { SEVERITY } from '../diagnostics/consts.js';
import { hasError, type Diagnostic } from '../diagnostics/diagnostic.js';
import { BARREL_FILE_NAME } from './consts.js';
import {
  checkDestination,
  checkDestinationNotIncluded,
  resolveDestination,
  writeDestination,
  type Destination,
} from './destination.js';
import { mirrorScannedFiles, type MirrorScannedFilesPayload } from './mirror/mirror.js';
import { isOutsideRootDirectory } from './mirror/scannedModule.js';
import { toPosixPath } from './mirror/utils.js';
import { createNoInputFilesDiagnostic, findInputFiles, type ScanScope } from './scan.js';

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

const promoteWarnings = (diagnostics: ReadonlyArray<Diagnostic>): Diagnostic[] => {
  return diagnostics.map((diagnostic) => ({ ...diagnostic, severity: SEVERITY.ERROR }));
};

type UnwrittenPayloadArgs = Pick<CompilePayload, 'settings' | 'destination'> & {
  diagnostics: ReadonlyArray<Diagnostic>;
  strict: boolean;
};

// The payload before anything is written, with `strict` applied.
const unwrittenPayload = ({
  diagnostics,
  settings,
  destination,
  strict,
}: UnwrittenPayloadArgs): CompilePayload => {
  return {
    diagnostics: strict ? promoteWarnings(diagnostics) : [...diagnostics],
    settings,
    destination,
    written: false,
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
  const resolvedSettingsPayload = await resolveSettings({
    cwd: resolve(cwd),
    configPath,
    overrides,
  });
  if (resolvedSettingsPayload.settings === undefined) {
    return unwrittenPayload({
      diagnostics: resolvedSettingsPayload.diagnostics,
      settings: undefined,
      destination: undefined,
      strict,
    });
  }
  const { settings, baseDirectory } = resolvedSettingsPayload;
  const destination: Destination = resolveDestination(baseDirectory, settings);
  const rootDirectory = resolve(baseDirectory, settings.rootDir);

  const scope: ScanScope = {
    baseDirectory,
    include: settings.include,
    destination: destination.path,
  };
  const files = await findInputFiles(scope);

  const found: Diagnostic[] = [
    ...checkDestinationNotIncluded({
      ...scope,
      // Where each scanned file would be mirrored, plus the barrel. A file
      // outside the Root Directory has no place in the mirror, which
      // FILE_OUTSIDE_ROOT_DIR reports.
      mirroredFilePaths: [
        BARREL_FILE_NAME,
        ...files
          .map((file) => toPosixPath(relative(rootDirectory, file)))
          .filter((relativePath) => !isOutsideRootDirectory(relativePath)),
      ],
    }),
    ...(await checkDestination(destination.path)),
  ];
  if (files.length === 0) {
    found.push(createNoInputFilesDiagnostic(settings.include));
  }
  const mirroredScannedFiles: MirrorScannedFilesPayload = mirrorScannedFiles({
    scannedFilePaths: files,
    baseDirectory,
    rootDirectory,
    destinationDirectory: destination.path,
  });
  found.push(...mirroredScannedFiles.diagnostics);

  const payload = unwrittenPayload({
    diagnostics: found,
    settings,
    destination: destination.path,
    strict,
  });
  if (hasError(payload.diagnostics)) {
    return payload;
  }
  const writeFailure = await writeDestination({
    destination,
    mirroredFiles: mirroredScannedFiles.mirroredFiles,
  });
  return writeFailure.length > 0
    ? { ...payload, diagnostics: [...payload.diagnostics, ...writeFailure] }
    : { ...payload, written: true };
};
