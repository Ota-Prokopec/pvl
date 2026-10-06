// Where the Destination File goes, whether it can go there, and writing it.
import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, matchesGlob, posix, relative, resolve, sep } from 'node:path';
import type { ValueOfEnum } from '@repo/types';
import type { Settings } from '../config/config.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/consts.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { errorMessage } from '../utils.js';
import { DEFAULT_DESTINATION_DIRECTORY } from './consts.js';
import type { ScanScope } from './scan.js';

/**
 * `FILE` is the single TypeScript file `destination` names; `PACKAGE` is the
 * default `node_modules` package directory, used when `destination` is unset.
 */
export const DESTINATION_KIND = {
  FILE: 'FILE',
  PACKAGE: 'PACKAGE',
} as const;

export type Destination = {
  kind: ValueOfEnum<typeof DESTINATION_KIND>;
  /** Absolute. */
  path: string;
};

export const resolveDestination = (baseDirectory: string, settings: Settings): Destination => {
  return settings.destination === undefined
    ? { kind: DESTINATION_KIND.PACKAGE, path: join(baseDirectory, DEFAULT_DESTINATION_DIRECTORY) }
    : { kind: DESTINATION_KIND.FILE, path: resolve(baseDirectory, settings.destination) };
};

const createUnwritableDiagnostic = (path: string, reason: string): Diagnostic => {
  return createDiagnostic({
    code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
    message: `Can't write the Destination File to ${path}: ${reason}.`,
    file: path,
  });
};

const statOrUndefined = async (
  path: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> => {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
};

const isWritable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Checks, without writing anything, that `path` can be written as a file:
 * it isn't a directory, and its nearest existing ancestor is a writable
 * directory.
 */
export const checkWritable = async (path: string): Promise<Diagnostic[]> => {
  const existing = await statOrUndefined(path);
  if (existing?.isDirectory()) {
    return [createUnwritableDiagnostic(path, 'it is a directory, and destination names a file')];
  }
  if (existing !== undefined) {
    return (await isWritable(path))
      ? []
      : [createUnwritableDiagnostic(path, 'the file is read-only')];
  }
  let ancestor = dirname(path);
  let ancestorStat = await statOrUndefined(ancestor);
  while (ancestorStat === undefined && dirname(ancestor) !== ancestor) {
    ancestor = dirname(ancestor);
    ancestorStat = await statOrUndefined(ancestor);
  }
  if (ancestorStat === undefined || !ancestorStat.isDirectory()) {
    return [createUnwritableDiagnostic(path, `${ancestor} is not a directory`)];
  }
  return (await isWritable(ancestor))
    ? []
    : [createUnwritableDiagnostic(path, `the directory ${ancestor} is read-only`)];
};

/**
 * Reports each `include` pattern that matches the destination, inside the
 * base directory or out of it (`../shared/**`).
 */
export const checkDestinationNotIncluded = ({
  baseDirectory,
  include,
  destination,
}: ScanScope): Diagnostic[] => {
  const fromBaseDirectory = relative(baseDirectory, destination);
  // On another drive (Windows), no relative pattern can reach it.
  if (isAbsolute(fromBaseDirectory)) {
    return [];
  }
  const asPosix = fromBaseDirectory.split(sep).join(posix.sep);
  return include
    .filter((pattern) => matchesGlob(asPosix, posix.normalize(pattern)))
    .map((pattern) =>
      createDiagnostic({
        code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
        message: `The destination ${asPosix} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
        file: destination,
      }),
    );
};

/** Writes `content` to `path`, creating its directory; a failure comes back as a diagnostic. */
export type WriteDestinationFileArgs = {
  path: string;
  content: string;
};

export const writeDestinationFile = async ({
  path,
  content,
}: WriteDestinationFileArgs): Promise<Diagnostic[]> => {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return [];
  } catch (error) {
    return [createUnwritableDiagnostic(path, errorMessage(error))];
  }
};
