// Turns the config file and the overrides into the settings a run uses, and
// finds the base directory relative paths resolve against.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Issue } from '@pvl/schema';
import { configSchema, type PvlConfig, type SettingOverrides, type Settings } from './config.js';
import {
  CONFIG_FILE_NAME,
  DEFAULT_INCLUDE,
  DEFAULT_ROOT_DIR,
  DEFAULT_WATCH,
  DEFAULT_WITH_TYPES,
} from './consts.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { errorMessage } from '../utils.js';

export type ResolveSettingsPayload =
  | { diagnostics: Diagnostic[]; settings: Settings; baseDirectory: string }
  | { diagnostics: Diagnostic[]; settings: undefined; baseDirectory: undefined };

const fail = (diagnostics: Diagnostic[]): ResolveSettingsPayload => {
  return { diagnostics, settings: undefined, baseDirectory: undefined };
};

const invalidConfigDiagnostics = (
  issues: ReadonlyArray<Issue>,
  file: string | undefined,
): Diagnostic[] => {
  // Without a file, the setting came in as an override (a CLI flag).
  const source = file === undefined ? 'override' : 'setting';
  return issues.map((issue) => {
    const key = (issue.path ?? []).map(String).join('.');
    return createDiagnostic({
      code: DIAGNOSTIC_CODE.INVALID_CONFIG,
      message:
        key === ''
          ? `The config must be a JSON object: ${issue.message}.`
          : `Invalid ${source} \`${key}\`: ${issue.message}.`,
      file,
    });
  });
};

const unreadableDiagnostic = (file: string, reason: string): Diagnostic => {
  return createDiagnostic({
    code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE,
    message: `Can't read the config file: ${reason}.`,
    file,
  });
};

const isMissingFile = (error: unknown): boolean => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
};

// `undefined` means "not set", so a caller can pass every override
// through whether or not it was given.
const definedOnly = (overrides: SettingOverrides): SettingOverrides => {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as SettingOverrides;
};

export type ResolveSettingsArgs = {
  cwd: string;
  configPath: string | undefined;
  overrides: SettingOverrides;
};

/** Reads `pvlconfig.json` and merges it under the overrides and over the defaults. */
export const resolveSettings = async ({
  cwd,
  configPath,
  overrides,
}: ResolveSettingsArgs): Promise<ResolveSettingsPayload> => {
  const given = definedOnly(overrides);
  const overrideIssues = configSchema.validate(given).issues;
  if (overrideIssues) {
    return fail(invalidConfigDiagnostics(overrideIssues, undefined));
  }

  const file = resolve(cwd, configPath ?? CONFIG_FILE_NAME);
  let text: string | undefined;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    // Only the implicit lookup may come up empty: a path the user named
    // has to exist.
    if (configPath !== undefined || !isMissingFile(error)) {
      return fail([unreadableDiagnostic(file, errorMessage(error))]);
    }
  }

  let config: PvlConfig = {};
  if (text === undefined) {
    if (Object.keys(given).length === 0) {
      return fail([
        createDiagnostic({
          code: DIAGNOSTIC_CODE.NO_CONFIG,
          message: `No ${CONFIG_FILE_NAME} in ${cwd}, and no setting passed as a flag. Add a ${CONFIG_FILE_NAME}, point --config at one, or pass --include/--destination.`,
        }),
      ]);
    }
  } else {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return fail([unreadableDiagnostic(file, `it is not valid JSON (${errorMessage(error)})`)]);
    }
    const result = configSchema.validate(json);
    if (result.issues) {
      return fail(invalidConfigDiagnostics(result.issues, file));
    }
    config = result.value;
  }

  return {
    diagnostics: [],
    settings: {
      include: given.include ?? config.include ?? [...DEFAULT_INCLUDE],
      rootDir: given.rootDir ?? config.rootDir ?? DEFAULT_ROOT_DIR,
      destination: given.destination ?? config.destination,
      withTypes: given.withTypes ?? config.withTypes ?? DEFAULT_WITH_TYPES,
      watch: given.watch ?? config.watch ?? DEFAULT_WATCH,
    },
    baseDirectory: text === undefined ? cwd : dirname(file),
  };
};
