// Where the Destination Directory goes, whether it can go there, and writing
// it in one move.
import fs from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  matchesGlob,
  posix,
  relative,
  resolve,
} from 'node:path';
import type { Settings } from '../config/config.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { errorMessage } from '../utils.js';
import {
  DEFAULT_DESTINATION_DIRECTORY,
  DEFAULT_DESTINATION_GITIGNORE_TEXT,
  GENERATED_MARKER_FILE_NAME,
  GENERATED_MARKER_TEXT,
  GITIGNORE_FILE_NAME,
} from './consts.js';
import type { MirroredFile } from './mirror/mirror.js';
import { toPosixPath } from './mirror/utils.js';

/** Where the Destination Directory goes. */
export type Destination = {
  /** Absolute. */
  path: string;
  /** Whether `destination` was unset, so the default `.pvl` directory is used. */
  isDefault: boolean;
};

/**
 * The Destination Directory `settings` name, resolved against the base
 * directory, or the default `<baseDirectory>/.pvl`.
 *
 * ```ts
 * resolveDestination('/repo', { destination: undefined, … })   // { path: '/repo/.pvl', isDefault: true }
 * resolveDestination('/repo', { destination: 'generated', … }) // { path: '/repo/generated', isDefault: false }
 * ```
 */
export const resolveDestination = (baseDirectory: string, settings: Settings): Destination => {
  return settings.destination === undefined
    ? { path: join(baseDirectory, DEFAULT_DESTINATION_DIRECTORY), isDefault: true }
    : { path: resolve(baseDirectory, settings.destination), isDefault: false };
};

// A DESTINATION_UNWRITABLE diagnostic for `path`, saying why.
const createDestinationUnwritableDiagnostic = (path: string, reason: string): Diagnostic => {
  return createDiagnostic({
    code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
    message: `Can't write the Destination Directory to ${path}: ${reason}.`,
    file: path,
  });
};

/**
 * What `stat` says about `path`, or `undefined` when nothing is there.
 * @returns metadata or a directory/file in the path
 */

const statOrUndefined = async (
  path: string,
): Promise<Awaited<ReturnType<typeof fs.stat>> | undefined> => {
  try {
    return await fs.stat(path);
  } catch {
    return undefined;
  }
};

// Whether the current process may create and remove entries in the
// directory `path`.
const isWritable = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

// Whether the existing directory `path` may be replaced: it is empty, or it
// carries the marker a previous run left.
//
//   .pvl/ holding .pvl-generated, index.ts, schemas/   // true
//   generated/ holding nothing                         // true
//   src/ holding index.ts, app.ts                      // false
const isReplaceableDirectory = async (path: string): Promise<boolean> => {
  const entryNames = await fs.readdir(path);
  return entryNames.length === 0 || entryNames.includes(GENERATED_MARKER_FILE_NAME);
};

/**
 * Checks, without writing anything, that the Destination Directory can be
 * written at `path`, which needs its parent to be writable, since the
 * directory is replaced in one move:
 *
 * - DESTINATION_UNWRITABLE: `path` is a file, its nearest existing ancestor
 *   is a file, or the directory it would be created in is read-only.
 * - DESTINATION_NOT_EMPTY: `path` is a directory holding files but no
 *   `.pvl-generated` marker, so the compiler didn't write it.
 *
 * ```ts
 * await checkDestination('/repo/.pvl')     // [] when absent, empty or written by the compiler
 * await checkDestination('/repo/src')      // [DESTINATION_NOT_EMPTY]
 * await checkDestination('/repo/notes.md') // [DESTINATION_UNWRITABLE]: a file
 * ```
 */
export const checkDestination = async (path: string): Promise<Diagnostic[]> => {
  const existing = await statOrUndefined(path);

  if (existing !== undefined && !existing.isDirectory()) {
    return [
      createDestinationUnwritableDiagnostic(
        path,
        'it is a file, and destination names a directory',
      ),
    ];
  }

  if (existing !== undefined && !(await isReplaceableDirectory(path))) {
    return [
      createDiagnostic({
        code: DIAGNOSTIC_CODE.DESTINATION_NOT_EMPTY,
        message: `${path} holds files the compiler didn't write, so it won't be replaced. Point destination at a new or empty directory.`,
        file: path,
      }),
    ];
  }

  let ancestor = dirname(path);
  let ancestorStat = await statOrUndefined(ancestor);
  while (ancestorStat === undefined && dirname(ancestor) !== ancestor) {
    ancestor = dirname(ancestor);
    ancestorStat = await statOrUndefined(ancestor);
  }
  if (ancestorStat === undefined || !ancestorStat.isDirectory()) {
    return [createDestinationUnwritableDiagnostic(path, `${ancestor} is not a directory`)];
  }
  return (await isWritable(ancestor))
    ? []
    : [createDestinationUnwritableDiagnostic(path, `the directory ${ancestor} is read-only`)];
};

export type CheckDestinationNotIncludedArgs = {
  /** The directory relative paths resolve against. */
  baseDirectory: string;
  include: ReadonlyArray<string>;
  /** The Destination Directory's absolute path. */
  destination: string;
  /** The files the Destination Directory will hold, relative to it. */
  mirroredFilePaths: ReadonlyArray<string>;
};

/**
 * Reports each `include` pattern that matches the Destination Directory or
 * a file written into it, inside the base directory or out of it
 * (`../shared/**`).
 *
 * ```ts
 * // include: ['src/**\/*.ts'], destination: 'src/compiled'
 * // → DESTINATION_INSIDE_INCLUDE: src/compiled/schemas/user.ts would match
 * // include: ['src/schemas/**\/*.ts'], destination: '.pvl' → []
 * ```
 */
export const checkDestinationNotIncluded = ({
  baseDirectory,
  include,
  destination,
  mirroredFilePaths,
}: CheckDestinationNotIncludedArgs): Diagnostic[] => {
  const destinationFromBaseDirectory = relative(baseDirectory, destination);
  // On another drive (Windows), no relative pattern can reach it.
  if (isAbsolute(destinationFromBaseDirectory)) {
    return [];
  }
  const destinationAsPosix = toPosixPath(destinationFromBaseDirectory);

  const writtenPaths = [
    destinationAsPosix,
    ...mirroredFilePaths.map((mirroredFilePath) =>
      posix.join(destinationAsPosix, mirroredFilePath),
    ),
  ];

  return include
    .filter((pattern) =>
      writtenPaths.some((writtenPath) => matchesGlob(writtenPath, posix.normalize(pattern))),
    )
    .map((pattern) =>
      createDiagnostic({
        code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
        message: `The destination ${destinationAsPosix} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
        file: destination,
      }),
    );
};

export type WriteDestinationArgs = {
  destination: Destination;
  mirroredFiles: ReadonlyArray<MirroredFile>;
};

/**
 * Writes the Destination Directory in one move: every mirrored file, the
 * `.pvl-generated` marker and, for the default destination, a `.gitignore`
 * of `*` go into a temporary sibling directory, which then replaces the
 * previous Destination Directory. A failure leaves the previous one as it
 * was, removes the temporary directory and comes back as a
 * DESTINATION_UNWRITABLE diagnostic.
 *
 * ```text
 * /repo/.pvl.pvl-tmp/  ← written first
 * /repo/.pvl/          ← removed, then the temporary directory is renamed to it
 * ```
 */
export const writeDestination = async ({
  destination,
  mirroredFiles,
}: WriteDestinationArgs): Promise<Diagnostic[]> => {
  const temporaryPath = join(dirname(destination.path), `${basename(destination.path)}.pvl-tmp`);

  const filesToWrite: ReadonlyArray<MirroredFile> = [
    ...mirroredFiles,
    { relativePath: GENERATED_MARKER_FILE_NAME, text: GENERATED_MARKER_TEXT },
    ...(destination.isDefault
      ? [{ relativePath: GITIGNORE_FILE_NAME, text: DEFAULT_DESTINATION_GITIGNORE_TEXT }]
      : []),
  ];

  try {
    await fs.rm(temporaryPath, { recursive: true, force: true });
    await fs.mkdir(temporaryPath, { recursive: true });
    for (const { relativePath, text } of filesToWrite) {
      const filePath = join(temporaryPath, relativePath);
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, text);
    }
    await fs.rm(destination.path, { recursive: true, force: true });
    await fs.rename(temporaryPath, destination.path);
    return [];
  } catch (error) {
    await fs.rm(temporaryPath, { recursive: true, force: true });
    return [createDestinationUnwritableDiagnostic(destination.path, errorMessage(error))];
  }
};
