/**
 * Rule: inside an `apps/*` or `packages/*` entry, every `.env*` file is
 * `.env.production` or `.env.development`. Runs on the entry's `package.json`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JSONRuleDefinition } from '@eslint/json';
import { findEntry } from '../utils.ts';
import { ALLOWED_ENV_FILE_NAMES, ENV_FILE_SKIPPED_DIRECTORIES } from './consts.ts';

const findEnvFiles = (directory: string): string[] => {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry): string[] => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ENV_FILE_SKIPPED_DIRECTORIES.has(entry.name) ? [] : findEnvFiles(entryPath);
    }
    return entry.name.startsWith('.env') && !ALLOWED_ENV_FILE_NAMES.has(entry.name)
      ? [entryPath]
      : [];
  });
};

export const envFileNames: JSONRuleDefinition = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Inside an `apps/*` or `packages/*` entry, every `.env*` file is `.env.production` or `.env.development`.',
    },
    messages: {
      envName: 'Rename `{{file}}` to `.env.production` or `.env.development`, scoped into its app.',
    },
  },
  create: (context) => {
    return {
      Document: (document): void => {
        if (findEntry(context.filename) === undefined) {
          return;
        }
        const entryDirectory = path.dirname(context.filename);
        for (const file of findEnvFiles(entryDirectory)) {
          context.report({
            loc: document.loc,
            messageId: 'envName',
            data: { file: path.relative(entryDirectory, file) },
          });
        }
      },
    };
  },
};
