import { describe, expect, it } from 'vitest';
import configJsonSchema from '../src/config/json-schema.json' with { type: 'json' };
import {
  configSchema,
  DEFAULT_INCLUDE,
  DEFAULT_ROOT_DIR,
  DEFAULT_WATCH,
  DEFAULT_WITH_TYPES,
} from '../src/index.js';

describe('json-schema.json', () => {
  it('describes every pvlconfig.json setting, with its default', () => {
    expect(configJsonSchema).toMatchInlineSnapshot(`
      {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "additionalProperties": false,
        "description": "Configuration for \`pvl compile\` (@pvl/schema-compiler).",
        "properties": {
          "$schema": {
            "description": "The JSON Schema this file is checked against, for editor autocomplete.",
            "type": "string",
          },
          "destination": {
            "description": "The Destination Directory to write, relative to this file. Unset, it is .pvl, which also gets a .gitignore. The compiler only replaces a directory it wrote itself.",
            "type": "string",
          },
          "include": {
            "default": [
              "src/schemas/**/*.ts",
            ],
            "description": "Globs selecting the schema files to compile, relative to this file. node_modules and the destination are never included.",
            "items": {
              "type": "string",
            },
            "type": "array",
          },
          "rootDir": {
            "default": "src",
            "description": "The source root the Destination Directory mirrors, relative to this file: a scanned file at <rootDir>/schemas/user.ts is mirrored to <destination>/schemas/user.ts. Every scanned file must sit under it.",
            "type": "string",
          },
          "watch": {
            "default": false,
            "description": "Whether \`pvl compile\` keeps running and recompiles on every change.",
            "type": "boolean",
          },
          "withTypes": {
            "default": true,
            "description": "Whether to generate each compiled Schema's Data and Input type aliases.",
            "type": "boolean",
          },
        },
        "title": "pvlconfig.json",
        "type": "object",
      }
    `);
  });

  // The file is written by hand, so these catch it drifting from `configSchema`.
  it('has the same keys as configSchema', () => {
    expect(Object.keys(configJsonSchema.properties).sort()).toEqual(
      Object.keys(configSchema.shape).sort(),
    );
  });

  it('has the defaults the compiler runs with', () => {
    const { include, rootDir, withTypes, watch } = configJsonSchema.properties;
    expect([include.default, rootDir.default, withTypes.default, watch.default]).toEqual([
      DEFAULT_INCLUDE,
      DEFAULT_ROOT_DIR,
      DEFAULT_WITH_TYPES,
      DEFAULT_WATCH,
    ]);
  });
});
