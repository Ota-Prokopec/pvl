// Where the Destination Directory goes, whether it can go there, and writing
// it in one move.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import type { Settings } from '../config/config.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { errorMessage, statOrUndefined } from '../utils.js';
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
import { toPath, type Path } from './path.js';

/**
 * Where the Destination Directory goes. Its `relative.path` is relative to the
 * base directory, the form `include` patterns match against.
 */
export type Destination = Required<Path> & {
  /** Whether `destination` was unset, so the default `.pvl` directory is used. */
  isDefault: boolean;
};

export type CheckDestinationNotIncludedArgs = {
  include: ReadonlyArray<string>;
  destination: Destination;
};

/** What {@link DestinationWriter.writeDestination} did: whether the Destination Directory is in place, and why not. */
export type WriteDestinationPayload = {
  /** Whether the new Destination Directory replaced the previous one. */
  isWritten: boolean;
  /** Empty when `isWritten`; otherwise the one DESTINATION_UNWRITABLE diagnostic. */
  diagnostics: Diagnostic[];
};

export type WriteDestinationArgs = {
  destination: Destination;
  mirroredFiles: ReadonlyArray<MirroredFile>;
};

/**
 * Owns the Destination Directory of one compilation run: resolves where it goes,
 * checks that writing it there destroys nothing the compiler didn't write, and
 * writes it in one move. A static-only class: it holds no state and is never
 * instantiated.
 *
 * A run calls the public functions in this order: `resolveDestination`, then both
 * checks, then `writeDestination` only when no check reported an error.
 *
 * ```ts
 * const destination = DestinationWriter.resolveDestination(baseDirectory, settings);
 * const diagnostics = [
 *   ...DestinationWriter.checkDestinationNotIncluded({ include: settings.include, destination }),
 *   ...(await DestinationWriter.checkDestination(destination.absolutePath)),
 * ];
 * if (!hasError(diagnostics)) {
 *   await DestinationWriter.writeDestination({ destination, mirroredFiles });
 * }
 * ```
 *
 * ## Public functions
 *
 * ### `DestinationWriter.resolveDestination(baseDirectory, settings)`
 *
 * Resolves the `destination` setting against the base directory. Pure: touches no file.
 *
 * **Input**:
 * - `baseDirectory`: the absolute directory relative settings resolve against (the
 *   config file's directory, or the cwd).
 * - `settings`: the run's `Settings`; only `destination` is read. `undefined` means
 *   the default `.pvl` directory.
 *
 * **Output** (`Destination`): `{ absolutePath, relative, isDefault }`, where
 * `relative.path` is POSIX-separated and relative to `relative.absoluteBase`, the
 * `baseDirectory`.
 *
 * ### `DestinationWriter.toDestinationSiblingPath(destinationPath, suffix)`
 *
 * The path of a sibling directory a run keeps beside the Destination Directory (the
 * temporary and backup directories), so the scanner can skip them too. Pure.
 *
 * **Input**: `destinationPath`, the Destination Directory's absolute path, and
 * `suffix`, `TEMPORARY_DESTINATION_SUFFIX` or `BACKUP_DESTINATION_SUFFIX`.
 *
 * **Output** (`string`): the directory's name with `suffix` appended, in the same parent.
 *
 * ### `DestinationWriter.checkDestination(destinationPath)`
 *
 * Checks, without writing anything, that the directory at `destinationPath` may be
 * replaced: it is absent, empty, or carries the `.pvl-generated` marker a previous
 * run left.
 *
 * **Input**: `destinationPath`, the Destination Directory's absolute path.
 *
 * **Output** (`Promise<Diagnostic[]>`): empty when it may be replaced, otherwise one of:
 * - `DESTINATION_UNWRITABLE`: `destinationPath` is a file.
 * - `DESTINATION_NOT_EMPTY`: a directory holding files but no marker.
 *
 * ### `DestinationWriter.checkDestinationNotIncluded(args)`
 *
 * Checks that no `include` pattern could make the compiler scan its own output. Pure.
 *
 * **Input** (`CheckDestinationNotIncludedArgs`): `include`, the run's glob patterns, and
 * `destination`, the resolved `Destination`.
 *
 * **Output** (`Diagnostic[]`): one `DESTINATION_INSIDE_INCLUDE` per pattern that matches
 * the Destination Directory or anything inside it; empty when none does.
 *
 * ### `DestinationWriter.writeDestination(args)`
 *
 * Writes the mirrored files, the `.pvl-generated` marker and, for the default
 * destination, a `.gitignore` of `*` into a temporary sibling directory, then swaps it
 * in for the previous Destination Directory. Never throws: any failure restores the
 * previous directory and is reported as a diagnostic.
 *
 * **Input** (`WriteDestinationArgs`): `destination`, the resolved `Destination`, and
 * `mirroredFiles`, each a path relative to the Destination Directory and its text.
 *
 * **Output** (`Promise<WriteDestinationPayload>`), one of:
 * - Success: `{ isWritten: true, diagnostics: [] }`.
 * - Failure: `{ isWritten: false, diagnostics: [DESTINATION_UNWRITABLE] }`, the previous
 *   Destination Directory left as it was.
 */
export class DestinationWriter {
  /**
   * The Destination Directory `settings` name, resolved against the base
   * directory, or the default `<baseDirectory>/.pvl`.
   *
   * ```ts
   * resolveDestination('/repo', { destination: undefined, … })
   * // { absolutePath: '/repo/.pvl', relative: { absoluteBase: '/repo', path: '.pvl' }, isDefault: true }
   * resolveDestination('/repo', { destination: './out/../generated', … })
   * // { absolutePath: '/repo/generated', relative: { absoluteBase: '/repo', path: 'generated' }, isDefault: false }
   * ```
   */
  public static resolveDestination(baseDirectory: string, settings: Settings): Destination {
    const isDefault = settings.destination === undefined;

    const absolutePath = path.resolve(
      baseDirectory,
      settings.destination ?? DEFAULT_DESTINATION_DIRECTORY,
    );

    return { ...toPath(absolutePath, baseDirectory), isDefault };
  }

  /**
   * The path of the sibling directory a run keeps beside the Destination
   * Directory at `destinationPath`: its name with `suffix` appended.
   *
   * ```ts
   * toDestinationSiblingPath('/repo/.pvl', '.pvl-tmp')      // '/repo/.pvl.pvl-tmp'
   * toDestinationSiblingPath('/repo/generated', '.pvl-old') // '/repo/generated.pvl-old'
   * ```
   */
  public static toDestinationSiblingPath(destinationPath: string, suffix: string): string {
    return path.join(path.dirname(destinationPath), `${path.basename(destinationPath)}${suffix}`);
  }

  /**
   * Checks, without writing anything, that writing the Destination Directory at
   * `destinationPath` won't destroy anything the compiler didn't write:
   *
   * - DESTINATION_UNWRITABLE: `destinationPath` is a file.
   * - DESTINATION_NOT_EMPTY: `destinationPath` is a directory holding files but no
   *   `.pvl-generated` marker, so the compiler didn't write it.
   *
   * Any other reason the directory can't be written, such as a parent that is a
   * file or a read-only directory, is left to {@link DestinationWriter.writeDestination}.
   *
   * ```ts
   * await checkDestination('/repo/.pvl')     // [] when absent, empty or written by the compiler
   * await checkDestination('/repo/src')      // [DESTINATION_NOT_EMPTY]
   * await checkDestination('/repo/notes.md') // [DESTINATION_UNWRITABLE]: a file
   * ```
   */
  public static async checkDestination(destinationPath: string): Promise<Diagnostic[]> {
    const existing = await statOrUndefined(destinationPath);

    if (existing !== undefined && !existing.isDirectory()) {
      return [
        DestinationWriter.createDestinationUnwritableDiagnostic(
          destinationPath,
          'it is a file, and destination names a directory',
        ),
      ];
    }

    if (
      existing !== undefined &&
      !(await DestinationWriter.isReplaceableDirectory(destinationPath))
    ) {
      return [
        createDiagnostic({
          code: DIAGNOSTIC_CODE.DESTINATION_NOT_EMPTY,
          message: `${destinationPath} holds files the compiler didn't write, so it won't be replaced. Point destination at a new or empty directory.`,
          file: destinationPath,
        }),
      ];
    }

    return [];
  }

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
  public static checkDestinationNotIncluded({
    include,
    destination,
  }: CheckDestinationNotIncludedArgs): Diagnostic[] {
    return include
      .filter((pattern) =>
        // `partial`: the pattern matches the destination or could match something inside it.
        minimatch(destination.relative.path, path.posix.normalize(pattern), { partial: true }),
      )
      .map((pattern) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
          message: `The destination ${destination.relative.path} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
          file: destination.absolutePath,
        }),
      );
  }

  /**
   * Writes the Destination Directory in one move: every mirrored file, the
   * `.pvl-generated` marker and, for the default destination, a `.gitignore`
   * of `*` go into a temporary sibling directory, which then replaces the
   * previous Destination Directory. The previous one is renamed aside, not
   * removed, until the new one is in place, so a failure at any step puts it
   * back as it was, removes the temporary directory and comes back as
   * `isWritten: false` with a DESTINATION_UNWRITABLE diagnostic. Directories a
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
   * await writeDestination({ destination, mirroredFiles }) // { isWritten: true, diagnostics: [] }
   * // the parent directory is read-only:
   * await writeDestination({ destination, mirroredFiles }) // { isWritten: false, diagnostics: [DESTINATION_UNWRITABLE] }
   * ```
   */
  public static async writeDestination({
    destination,
    mirroredFiles,
  }: WriteDestinationArgs): Promise<WriteDestinationPayload> {
    const temporaryPath = DestinationWriter.toDestinationSiblingPath(
      destination.absolutePath,
      TEMPORARY_DESTINATION_SUFFIX,
    );
    const backupPath = DestinationWriter.toDestinationSiblingPath(
      destination.absolutePath,
      BACKUP_DESTINATION_SUFFIX,
    );
    let isPreviousDestinationAside = false;

    const filesToWrite: ReadonlyArray<MirroredFile> = [
      // Mirrored files
      ...mirroredFiles,
      // PVL marker file
      { relativePath: GENERATED_MARKER_FILE_NAME, text: GENERATED_MARKER_TEXT },
      // Optional (only for default destination) .gitignore file
      ...(destination.isDefault
        ? [{ relativePath: GITIGNORE_FILE_NAME, text: DEFAULT_DESTINATION_GITIGNORE_TEXT }]
        : []),
    ];

    try {
      await Promise.all([
        fsPromises.rm(temporaryPath, { recursive: true, force: true }),
        fsPromises.rm(backupPath, { recursive: true, force: true }),
      ]);

      // code directory paths
      const directoryPaths = new Set(
        filesToWrite.map(({ relativePath }) =>
          path.dirname(path.join(temporaryPath, relativePath)),
        ),
      );
      // Promise to create destination files
      await Promise.all(
        [...directoryPaths].map((directoryPath) =>
          fsPromises.mkdir(directoryPath, { recursive: true }),
        ),
      );
      // Promise to write a file
      await Promise.all(
        filesToWrite.map(({ relativePath, text }) =>
          fsPromises.writeFile(path.join(temporaryPath, relativePath), text),
        ),
      );

      if ((await statOrUndefined(destination.absolutePath)) !== undefined) {
        await fsPromises.rename(destination.absolutePath, backupPath);
        isPreviousDestinationAside = true;
      }
      await fsPromises.rename(temporaryPath, destination.absolutePath);
    } catch (error) {
      if (isPreviousDestinationAside) {
        await fsPromises.rename(backupPath, destination.absolutePath);
      }
      await fsPromises.rm(temporaryPath, { recursive: true, force: true });
      return {
        isWritten: false,
        diagnostics: [
          DestinationWriter.createDestinationUnwritableDiagnostic(
            destination.absolutePath,
            errorMessage(error),
          ),
        ],
      };
    }
    await fsPromises.rm(backupPath, { recursive: true, force: true });

    return { isWritten: true, diagnostics: [] };
  }

  // A DESTINATION_UNWRITABLE diagnostic for `destinationPath`, saying why.
  private static createDestinationUnwritableDiagnostic(
    destinationPath: string,
    reason: string,
  ): Diagnostic {
    return createDiagnostic({
      code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
      message: `Can't write the Destination Directory to ${destinationPath}: ${reason}.`,
      file: destinationPath,
    });
  }

  // Whether the existing directory `directoryPath` may be replaced: it is empty,
  // or it carries the marker a previous run left.
  //
  //   .pvl/ holding .pvl-generated, index.ts, schemas/   // true
  //   generated/ holding nothing                         // true
  //   src/ holding index.ts, app.ts                      // false
  private static async isReplaceableDirectory(directoryPath: string): Promise<boolean> {
    const entryNames = await fsPromises.readdir(directoryPath);
    return entryNames.length === 0 || entryNames.includes(GENERATED_MARKER_FILE_NAME);
  }
}
