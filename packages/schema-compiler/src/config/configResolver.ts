// Turns the config file and the overrides into the settings a run uses, and
// finds the base directory relative paths resolve against.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { Destination } from '../destination/destination.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { definedOnlyKeys, errorMessage } from '../utils.js';
import {
  configSchema,
  type PvlConfig,
  type PvlConfigFilePayload,
  type PvlConfigOverrides,
} from './config.js';
import { CONFIG_FILE_NAME } from './consts.js';
import {
  DEFAULT_INCLUDE,
  DEFAULT_ROOT_DIR,
  DEFAULT_WATCH,
  DEFAULT_WITH_TYPES,
} from './defaults/consts.js';

type ResolveSettingsPayload =
  | { rawSettings: PvlConfig; baseDirectory: string; destination: Destination; isResolved: true }
  | { diagnostics: Diagnostic[]; isResolved: false };

type ResolveSettingsArgs = {
  cwd: string;
  configPath: string | undefined;
  overrides: PvlConfigOverrides;
};

export const resolveConfig = ({
  cwd,
  configPath,
  overrides,
}: ResolveSettingsArgs): Promise<ResolveSettingsPayload> => {
  const givenOverrides = definedOnlyKeys(overrides);
  const overrideIssues = configSchema.validate(givenOverrides).issues;
  if (overrideIssues) {
    return {
      //TODO: This will throw error in the future
      diagnostics: getInvalidConfigDiagnostics(overrideIssues, undefined),
      isResolved: false,
    };
  }

  const file = path.resolve(cwd, configPath ?? CONFIG_FILE_NAME);
  let text: string | undefined;
  try {
    text = await fsPromises.readFile(file, 'utf8');
  } catch (error) {
    // Only the implicit lookup may come up empty: a path the user named
    // has to exist.
    if (configPath !== undefined || !isMissingFileError(error)) {
      return {
        diagnostics: [createConfigFileUnreadableDiagnostic(file, errorMessage(error))],
        isResolved: false,
      };
    }
  }

  let config: PvlConfigFilePayload = {};
  if (text === undefined) {
    if (Object.keys(givenOverrides).length === 0) {
      return {
        diagnostics: [
          new Diagnostic({
            code: DIAGNOSTIC_CODE.NO_CONFIG,
            message: `No ${CONFIG_FILE_NAME} in ${cwd}, and no setting passed as a flag. Add a ${CONFIG_FILE_NAME}, point --config at one, or pass --include/--destination.`,
          }),
        ],
        isResolved: false,
      };
    }
  } else {
    const parsed = parseSettingsFile(file, text);
    if (parsed.config === undefined) {
      return { diagnostics: parsed.diagnostics, isResolved: false };
    }
    config = parsed.config;
  }

  const baseDirectory = text === undefined ? cwd : path.dirname(file);

  return {
    rawSettings: {
      include: givenOverrides.include ?? config.include ?? [...DEFAULT_INCLUDE],
      rootDir: givenOverrides.rootDir ?? config.rootDir ?? DEFAULT_ROOT_DIR,
      destination: givenOverrides.destination ?? config.destination,
      withTypes: givenOverrides.withTypes ?? config.withTypes ?? DEFAULT_WITH_TYPES,
      watch: givenOverrides.watch ?? config.watch ?? DEFAULT_WATCH,
    },
    destination: Destination.resolveDestination(
      baseDirectory,
      givenOverrides.destination ?? config.destination,
    ),
    baseDirectory,
    isResolved: true,
  };
};
