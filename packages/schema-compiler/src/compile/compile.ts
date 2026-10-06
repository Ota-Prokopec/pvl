// The programmatic entry point: one compilation run, from settings to the
// written Destination File. The CLI and any future bundler plugin wrap it.
import { resolve } from 'node:path';
import type { SettingOverrides, Settings } from '../config/config.js';
import { resolveSettings } from '../config/settings.js';
import { SEVERITY } from '../diagnostics/consts.js';
import { hasError, type Diagnostic } from '../diagnostics/diagnostic.js';
import { GENERATED_HEADER } from './consts.js';
import {
  checkDestinationNotIncluded,
  checkWritable,
  DESTINATION_KIND,
  resolveDestination,
  writeDestinationFile,
  type Destination,
} from './destination.js';
import {
  checkExports,
  createNoInputFilesDiagnostic,
  findInputFiles,
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
  /** The Destination File's absolute path, once settings resolved. */
  destination: string | undefined;
  /** Whether the Destination File was written. Never `true` when an error fired. */
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
 * writes the Destination File. Nothing is written when any error fired.
 * Problems come back as diagnostics; it doesn't throw for them.
 *
 * @example
 * ```ts
 * import { compile, hasError } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await compile({
 *   cwd: process.cwd(),
 *   overrides: { destination: 'src/generated/schemas.ts' },
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

  const scope: ScanScope = {
    baseDirectory,
    include: settings.include,
    destination: destination.path,
  };

  const found: Diagnostic[] = [];
  if (destination.kind === DESTINATION_KIND.FILE) {
    found.push(...checkDestinationNotIncluded(scope));
    found.push(...(await checkWritable(destination.path)));
  }
  const files = await findInputFiles(scope);
  if (files.length === 0) {
    found.push(createNoInputFilesDiagnostic(settings.include));
  }
  found.push(...checkExports(files));

  const payload = unwrittenPayload({
    diagnostics: found,
    settings,
    destination: destination.path,
    strict,
  });
  // Emitting the default `node_modules` package is a later step; until then
  // only a `destination` file is written.
  if (hasError(payload.diagnostics) || destination.kind === DESTINATION_KIND.PACKAGE) {
    return payload;
  }
  const writeFailure = await writeDestinationFile({
    path: destination.path,
    content: `${GENERATED_HEADER}\n`,
  });
  return writeFailure.length > 0
    ? { ...payload, diagnostics: [...payload.diagnostics, ...writeFailure] }
    : { ...payload, written: true };
};
