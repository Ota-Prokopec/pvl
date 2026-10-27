/** Helpers the rules share. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';

/** Builds a typescript-eslint rule; every rule here documents itself through `meta.docs.description`. */
export const createRule = ESLintUtils.RuleCreator.withoutDocs;

export const isUpperSnakeCase = (name: string): boolean => {
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name);
};

/**
 * The directory whose `kind` declarations (`consts`, `enums`, `types`)
 * `filename` holds: its own for a `<kind>.ts`, its parent's for a file
 * directly inside a `<kind>/` folder, else `undefined`.
 */
export const findDeclarationsOwner = (filename: string, kind: string): string | undefined => {
  const directory = path.dirname(filename);
  if (path.basename(filename) === `${kind}.ts`) {
    return directory;
  }
  return path.basename(directory) === kind ? path.dirname(directory) : undefined;
};

/** The `name` in the nearest `package.json` above `filename`, or `undefined` when none is found. */
export const findPackageName = (filename: string): string | undefined => {
  let directory = path.dirname(filename);
  while (path.dirname(directory) !== directory) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      return typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        typeof parsed.name === 'string'
        ? parsed.name
        : undefined;
    }
    directory = path.dirname(directory);
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
