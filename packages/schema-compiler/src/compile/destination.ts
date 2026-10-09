// Where the Destination Directory goes, whether it can go there, and writing
// it in one move.
import fs from 'node:fs/promises';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { minimatch } from 'minimatch';
import type { Settings } from '../config/config.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { errorMessage } from '../utils.js';
import {
  BACKUP_DESTINATION_SUFFIX,
  DEFAULT_DESTINATION_DIRECTORY,
  DEFAULT_DESTINATION_GITIGNORE_TEXT,
  GENERATED_MARKER_FILE_NAME,
  GENERATED_MARKER_TEXT,
  GITIGNORE_FILE_NAME,
  TEMPORARY_DESTINATION_SUFFIX,
} from './consts.js';
import type { MirroredFile } from './mirror/mirror.js';
import { toPosixPath } from './mirror/utils.js';

/** Where the Destination Directory goes. */
export type Destination = {
  absolutePath: string;
  /** Relative to the base directory, POSIX-separated, the form `include` patterns match against. */
  relativePath: string;
  /** Whether `destination` was unset, so the default `.pvl` directory is used. */
  isDefault: boolean;
};

/**
 * The Destination Directory `settings` name, resolved against the base
 * directory, or the default `<baseDirectory>/.pvl`.
 *
 * ```ts
 * resolveDestination('/repo', { destination: undefined, … })
 * // { absolutePath: '/repo/.pvl', relativePath: '.pvl', isDefault: true }
 * resolveDestination('/repo', { destination: './out/../generated', … })
 * // { absolutePath: '/repo/generated', relativePath: 'generated', isDefault: false }
 * ```
 */
export const resolveDestination = (baseDirectory: string, settings: Settings): Destination => {
  const isDefault = settings.destination === undefined;
  const absolutePath = resolve(
    baseDirectory,
    settings.destination ?? DEFAULT_DESTINATION_DIRECTORY,
  );
  return {
    absolutePath,
    relativePath: toPosixPath(relative(baseDirectory, absolutePath)),
    isDefault,
  };
};

/**
 * The path of the sibling directory a run keeps beside the Destination
 * Directory at `destinationPath`: its name with `suffix` appended.
 *
 * ```ts
 * toDestinationSiblingPath('/repo/.pvl', '.pvl-tmp')      // '/repo/.pvl.pvl-tmp'
 * toDestinationSiblingPath('/repo/generated', '.pvl-old') // '/repo/generated.pvl-old'
 * ```
 */
export const toDestinationSiblingPath = (destinationPath: string, suffix: string): string => {
  return join(dirname(destinationPath), `${basename(destinationPath)}${suffix}`);
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
  include: ReadonlyArray<string>;
  destination: Destination;
};

/**
 * Reports each `include` pattern that matches the Destination Directory or
 * could match anything inside it, inside the base directory or out of it
 * (`../shared/**`).
 *
 * ```ts
 * // include: ['src/**\/*.ts'], destination: 'src/compiled'
 * // → DESTINATION_INSIDE_INCLUDE: src/compiled/… would match
 * // include: ['src/schemas/**\/*.ts'], destination: '.pvl' → []
 * ```
 */
export const checkDestinationNotIncluded = ({
  include,
  destination,
}: CheckDestinationNotIncludedArgs): Diagnostic[] => {
  return include
    .filter((pattern) =>
      // `partial`: the pattern matches the destination or could match something inside it.
      minimatch(destination.relativePath, posix.normalize(pattern), { partial: true }),
    )
    .map((pattern) =>
      createDiagnostic({
        code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
        message: `The destination ${destination.relativePath} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
        file: destination.absolutePath,
      }),
    );
};

/** What {@link writeDestination} did: whether the Destination Directory is in place, and why not. */
export type WriteDestinationPayload = {
  /** Whether the new Destination Directory replaced the previous one. */
  isWritten: boolean;
  /** Empty when `written`; otherwise the one DESTINATION_UNWRITABLE diagnostic. */
  diagnostics: Diagnostic[];
};

export type WriteDestinationArgs = {
  destination: Destination;
  mirroredFiles: ReadonlyArray<MirroredFile>;
};

/**
 * Writes the Destination Directory in one move: every mirrored file, the
 * `.pvl-generated` marker and, for the default destination, a `.gitignore`
 * of `*` go into a temporary sibling directory, which then replaces the
 * previous Destination Directory. The previous one is renamed aside, not
 * removed, until the new one is in place, so a failure at any step puts it
 * back as it was, removes the temporary directory and comes back as
 * `written: false` with a DESTINATION_UNWRITABLE diagnostic. Directories a
 * crashed run left at either sibling path are replaced.
 *
 * ```text
 * /repo/.pvl.pvl-tmp/  ← 1. written
 * /repo/.pvl.pvl-old/  ← 2. the previous /repo/.pvl/, renamed aside
 * /repo/.pvl/          ← 3. the temporary directory, renamed into place
 *                         4. .pvl.pvl-old/ removed
 * ```
 *
 * ```ts
 * await writeDestination({ destination, mirroredFiles }) // { written: true, diagnostics: [] }
 * // the parent directory is read-only:
 * await writeDestination({ destination, mirroredFiles }) // { written: false, diagnostics: [DESTINATION_UNWRITABLE] }
 * ```
 */
export const writeDestination = async ({
  destination,
  mirroredFiles,
}: WriteDestinationArgs): Promise<WriteDestinationPayload> => {
  const temporaryPath = toDestinationSiblingPath(
    destination.absolutePath,
    TEMPORARY_DESTINATION_SUFFIX,
  );
  const backupPath = toDestinationSiblingPath(destination.absolutePath, BACKUP_DESTINATION_SUFFIX);
  let isPreviousDestinationAside = false;

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
    await fs.rm(backupPath, { recursive: true, force: true });
    if ((await statOrUndefined(destination.absolutePath)) !== undefined) {
      await fs.rename(destination.absolutePath, backupPath);
      isPreviousDestinationAside = true;
    }
    await fs.rename(temporaryPath, destination.absolutePath);
  } catch (error) {
    if (isPreviousDestinationAside) {
      await fs.rename(backupPath, destination.absolutePath);
    }
    await fs.rm(temporaryPath, { recursive: true, force: true });
    return {
      isWritten: false,
      diagnostics: [
        createDestinationUnwritableDiagnostic(destination.absolutePath, errorMessage(error)),
      ],
    };
  }
  await fs.rm(backupPath, { recursive: true, force: true });
  return { isWritten: true, diagnostics: [] };
};
