/** Helpers the rules share. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';

/** Builds a typescript-eslint rule; every rule here documents itself through `meta.docs.description`. */
export const createRule = ESLintUtils.RuleCreator.withoutDocs;

export const isUpperSnakeCase = (name: string): boolean => {
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name);
};

/** The `name` in the nearest `package.json` above `filename`, or `undefined` when none is found. */
export const findPackageName = (filename: string): string | undefined => {
  let directory = dirname(filename);
  while (dirname(directory) !== directory) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
      return typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        typeof parsed.name === 'string'
        ? parsed.name
        : undefined;
    }
    directory = dirname(directory);
  }
  return undefined;
};

/**
 * The workspace entry (`apps/<name>` or `packages/<name>`) whose own
 * `package.json` is `filename`, or `undefined` for any other file.
 */
export const findEntry = (filename: string): string | undefined => {
  const match = /(?:^|[\\/])((?:apps|packages)[\\/][^\\/]+)[\\/]package\.json$/.exec(filename);
  return match?.[1];
};
