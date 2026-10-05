/**
 * Rule: inside an `apps/*` or `packages/*` entry, every `.env*` file is
 * `.env.production` or `.env.development`. Runs on the entry's `package.json`.
 */
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { JSONRuleDefinition } from '@eslint/json';
import { findEntry } from '../utils.ts';

const ALLOWED = new Set(['.env.production', '.env.development']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', '.git']);

const findEnvFiles = (directory: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry): string[] => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : findEnvFiles(path);
    }
    return entry.name.startsWith('.env') && !ALLOWED.has(entry.name) ? [path] : [];
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
        const entryDirectory = dirname(context.filename);
        for (const file of findEnvFiles(entryDirectory)) {
          context.report({
            loc: document.loc,
            messageId: 'envName',
            data: { file: relative(entryDirectory, file) },
          });
        }
      },
    };
  },
};
