// Turns the config file and the overrides into the settings a run uses, and
// finds the base directory relative paths resolve against.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { Issue } from '@pvl/schema';
import { configSchema, type PvlConfig, type SettingOverrides, type Settings } from './config.js';
import {
  CONFIG_FILE_NAME,
  DEFAULT_INCLUDE,
  DEFAULT_ROOT_DIR,
  DEFAULT_WATCH,
  DEFAULT_WITH_TYPES,
} from '../consts.js';
import { DIAGNOSTIC_CODE } from '../enums.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { definedOnlyKeys, errorMessage } from '../utils.js';

export type ResolveSettingsPayload =
  | { diagnostics: Diagnostic[]; settings: Settings; baseDirectory: string }
  | { diagnostics: Diagnostic[]; settings: undefined; baseDirectory: undefined };

export type ParseSettingsFilePayload =
  { diagnostics: []; config: PvlConfig } | { diagnostics: Diagnostic[]; config: undefined };

export type ResolveSettingsArgs = {
  cwd: string;
  configPath: string | undefined;
  overrides: SettingOverrides;
};

/**
 * Resolves the settings of one compilation run from three sources, strongest first: the
 * `overrides` (CLI flags), the `pvlconfig.json` config file, and the built-in defaults.
 * A static-only class: it holds no state and is never instantiated.
 *
 * ## Public functions
 *
 * ### `SettingsResolver.resolveSettings(args)`
 *
 * Validates the overrides, locates and reads the config file, validates it, and merges
 * everything into the final `Settings`. It never throws on bad user input: every
 * problem comes back as a diagnostic.
 *
 * **Input** (`ResolveSettingsArgs`):
 * - `cwd`: the directory the config file is looked up in when `configPath` is not given.
 * - `configPath`: a path to the config file (relative to `cwd`), or `undefined` for the
 *   implicit `pvlconfig.json` lookup in `cwd`. A path the user named has to exist; the
 *   implicit lookup may come up empty.
 * - `overrides`: the settings passed as flags. Keys set to `undefined` count as not given.
 *
 * **Output** (`Promise<ResolveSettingsPayload>`), one of:
 * - Success: `{ diagnostics: [], settings, baseDirectory }`. `baseDirectory` is the
 *   directory of the config file, or `cwd` when no config file was used.
 * - Failure: `{ diagnostics, settings: undefined, baseDirectory: undefined }`, where the
 *   diagnostics are one of:
 *   - `INVALID_CONFIG`: an override, or the config file, doesn't match the config schema.
 *   - `CONFIG_UNREADABLE`: the config file can't be read, or isn't valid JSON.
 *   - `NO_CONFIG`: there is no config file and no override was passed.
 *
 * ```ts
 * await SettingsResolver.resolveSettings({ cwd, configPath: undefined, overrides: {} })
 * // { diagnostics: [], settings: { include, rootDir, destination, withTypes, watch }, baseDirectory: cwd }
 * await SettingsResolver.resolveSettings({ cwd, configPath: 'missing.json', overrides: {} })
 * // { diagnostics: [CONFIG_UNREADABLE], settings: undefined, baseDirectory: undefined }
 * ```
 */
//TODO: use ts.parseConfigFileTextToJson instead of read -> json.parse
export class ConfigResolver {
  /** Reads `pvlconfig.json` and merges it under the overrides and over the defaults. */
  public static async resolveConfig({
    cwd,
    configPath,
    overrides,
  }: ResolveSettingsArgs): Promise<ResolveSettingsPayload> {
    const givenOverrides = definedOnlyKeys(overrides);
    const overrideIssues = configSchema.validate(givenOverrides).issues;
    if (overrideIssues) {
      return {
        diagnostics: SettingsResolver.getInvalidConfigDiagnostics(overrideIssues, undefined),
        settings: undefined,
        baseDirectory: undefined,
      };
    }

    const file = path.resolve(cwd, configPath ?? CONFIG_FILE_NAME);
    let text: string | undefined;
    try {
      text = await fsPromises.readFile(file, 'utf8');
    } catch (error) {
      // Only the implicit lookup may come up empty: a path the user named
      // has to exist.
      if (configPath !== undefined || !SettingsResolver.isMissingFileError(error)) {
        return {
          diagnostics: [SettingsResolver.createUnreadableDiagnostic(file, errorMessage(error))],
          settings: undefined,
          baseDirectory: undefined,
        };
      }
    }

    let config: PvlConfig = {};
    if (text === undefined) {
      if (Object.keys(givenOverrides).length === 0) {
        return {
          diagnostics: [
            new Diagnostic({
              code: DIAGNOSTIC_CODE.NO_CONFIG,
              message: `No ${CONFIG_FILE_NAME} in ${cwd}, and no setting passed as a flag. Add a ${CONFIG_FILE_NAME}, point --config at one, or pass --include/--destination.`,
            }),
          ],
          settings: undefined,
          baseDirectory: undefined,
        };
      }
    } else {
      const parsed = SettingsResolver.parseSettingsFile(file, text);
      if (parsed.config === undefined) {
        return { diagnostics: parsed.diagnostics, settings: undefined, baseDirectory: undefined };
      }
      config = parsed.config;
    }

    return {
      diagnostics: [],
      settings: {
        include: givenOverrides.include ?? config.include ?? [...DEFAULT_INCLUDE],
        rootDir: givenOverrides.rootDir ?? config.rootDir ?? DEFAULT_ROOT_DIR,
        destination: givenOverrides.destination ?? config.destination,
        withTypes: givenOverrides.withTypes ?? config.withTypes ?? DEFAULT_WITH_TYPES,
        watch: givenOverrides.watch ?? config.watch ?? DEFAULT_WATCH,
      },
      baseDirectory: text === undefined ? cwd : path.dirname(file),
    };
  }

  /**
   * One `INVALID_CONFIG` diagnostic per config-schema issue, naming the failing key and
   * calling it a setting when it came from the config `file`, or an override (a CLI flag)
   * when `file` is `undefined`.
   *
   * ```ts
   * getInvalidConfigDiagnostics([{ path: ['rootDir'], message: 'Expected string' }], file)
   * // [{ message: 'Invalid setting `rootDir`: Expected string.', file }]
   * getInvalidConfigDiagnostics([{ path: ['destination'], message: 'Expected string' }], undefined)
   * // [{ message: 'Invalid override `destination`: Expected string.', file: undefined }]
   * getInvalidConfigDiagnostics([{ path: ['destinaton'], message: 'Unrecognized key "destinaton"' }], file)
   * // [{ message: 'Invalid setting `destinaton`: Unrecognized key "destinaton".', file }]
   * getInvalidConfigDiagnostics([{ message: 'Expected object' }], file) // the file holds `[]`
   * // [{ message: 'The config must be a JSON object: Expected object.', file }]
   * ```
   */
  private static getInvalidConfigDiagnostics(
    issues: ReadonlyArray<Issue>,
    file: string | undefined,
  ): Diagnostic[] {
    return issues.map((issue) => {
      const key = (issue.path ?? []).map(String).join('.');
      return new Diagnostic({
        code: DIAGNOSTIC_CODE.INVALID_CONFIG,
        message:
          key === ''
            ? `The config must be a JSON object: ${issue.message}.`
            : // Without a file, the setting came in as an override (a CLI flag).
              `Invalid ${file === undefined ? 'override' : 'setting'} \`${key}\`: ${issue.message}.`,
        file,
      });
    });
  }

  private static createConfigFileUnreadableDiagnostic(file: string, reason: string): Diagnostic {
    return new Diagnostic({
      code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE,
      message: `Can't read the config file: ${reason}.`,
      file,
    });
  }

  private static isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  }

  /**
   * Parses the text of the config `file` as JSON and validates it against the config schema.
   * Returns the `config`, or the diagnostics saying why the text isn't one.
   *
   * ```ts
   * parseSettingsFile(file, '{ "rootDir": "src" }') // { diagnostics: [], config: { rootDir: 'src' } }
   * parseSettingsFile(file, '{')                    // CONFIG_UNREADABLE: "it is not valid JSON (...)"
   * parseSettingsFile(file, '{ "rootDir": 1 }')     // INVALID_CONFIG: "Invalid setting `rootDir`: ..."
   * ```
   */
  private static parseSettingsFile(file: string, text: string): ParseSettingsFilePayload {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return {
        diagnostics: [
          SettingsResolver.createUnreadableDiagnostic(
            file,
            `it is not valid JSON (${errorMessage(error)})`,
          ),
        ],
        config: undefined,
      };
    }

    const result = configSchema.validate(json);
    if (result.issues) {
      return {
        diagnostics: SettingsResolver.getInvalidConfigDiagnostics(result.issues, file),
        config: undefined,
      };
    }
    return { diagnostics: [], config: result.value };
  }
}
