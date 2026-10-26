// Reading and validating the config file, and the diagnostics it raises.
import type { Issue } from '@pvl/schema';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { errorMessage } from '../utils.js';
import { pvlConfigFilePayloadSchema } from './configValidationSchemas.js';
import type { PvlConfigFilePayload } from './types.js';

export const isMissingFileError = (error: unknown): boolean => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
};

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
export const parseSettingsFile = (
  file: string,
  text: string,
):
  | { diagnostics: []; config: PvlConfigFilePayload }
  | { diagnostics: Diagnostic[]; config: undefined } => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      diagnostics: [
        createConfigFileUnreadableDiagnostic(file, `it is not valid JSON (${errorMessage(error)})`),
      ],
      config: undefined,
    };
  }

  const result = pvlConfigFilePayloadSchema.validate(json);
  if (result.issues) {
    return {
      diagnostics: getInvalidConfigDiagnostics(result.issues, file),
      config: undefined,
    };
  }
  return { diagnostics: [], config: result.value };
};

export const getInvalidConfigDiagnostics = (
  issues: ReadonlyArray<Issue>,
  file: string | undefined,
): Diagnostic[] => {
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
};

export const createConfigFileUnreadableDiagnostic = (file: string, reason: string): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE,
    message: `Can't read the config file: ${reason}.`,
    file,
  });
};
