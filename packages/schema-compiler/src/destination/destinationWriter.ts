// Whether the Destination Directory can be written where it goes, and
// writing it in one move.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { DIAGNOSTIC_CODE } from '../enums.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { errorMessage, statOrUndefined } from '../utils.js';
import {
  DEFAULT_DESTINATION_GITIGNORE_TEXT,
  GENERATED_MARKER_FILE_NAME,
  GENERATED_MARKER_TEXT,
  GITIGNORE_FILE_NAME,
} from '../consts.js';
import type { MirroredFile } from '../compilation/mirror/module.js';
import type { Destination } from './destination.js';

/** What {@link DestinationWriter.writeDestination} did: whether the Destination Directory is in place, and why not. */

/**
 * Writes the Destination Directory of one compilation run: checks that writing
 * it where `Destination.resolveDestination` put it destroys nothing the
 * compiler didn't write, and writes it in one move. A static-only class: it
 * holds no state and is never instantiated.
 *
 * A run calls `checkDestination`, then `writeDestination` only when no check
 * reported an error.
 *
 * ```ts
 * const destination = Destination.resolveDestination(baseDirectory, settings);
 * const diagnostics = await DestinationWriter.checkDestination(destination.absolutePath);
 * if (!Diagnostics.hasError(diagnostics)) {
 *   await DestinationWriter.writeDestination({ destination, mirroredFiles });
 * }
 * ```
 *
 * ## Public functions
 *
 * ### `DestinationWriter.checkDestination(absoluteDestinationPath)`
 *
 * Checks, without writing anything, that the directory at `absoluteDestinationPath`
 * may be replaced: it is absent, empty, or carries the `.pvl-generated` marker a
 * previous run left.
 *
 * **Output** (`Promise<Diagnostic[]>`): empty when it may be replaced, otherwise one of:
 * - `DESTINATION_UNWRITABLE`: `absoluteDestinationPath` is a file.
 * - `DESTINATION_NOT_EMPTY`: a directory holding files but no marker.
 *
 * ### `DestinationWriter.writeDestination(args)`
 *
 * Writes the mirrored files, the `.pvl-generated` marker and, for the default
 * destination, a `.gitignore` of `*` into a temporary sibling directory, then swaps it
 * in for the previous Destination Directory. Never throws: any failure restores the
 * previous directory and is reported as a diagnostic.
 *
 * **Input**: `destination`, the resolved `Destination`, and
 * `mirroredFiles`, each a path relative to the Destination Directory and its text.
 *
 * **Output** (`Promise<WriteDestinationPayload>`), one of:
 * - Success: `{ isWritten: true, diagnostics: [] }`.
 * - Failure: `{ isWritten: false, diagnostics: [DESTINATION_UNWRITABLE] }`, the previous
 *   Destination Directory left as it was.
 */
export class DestinationWriter {
  /**
   * Checks, without writing anything, that writing the Destination Directory at
   * `absoluteDestinationPath` won't destroy anything the compiler didn't write:
   *
   * - DESTINATION_UNWRITABLE: `absoluteDestinationPath` is a file.
   * - DESTINATION_NOT_EMPTY: `absoluteDestinationPath` is a directory holding files but no
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
  public static async checkDestination(absoluteDestinationPath: string): Promise<Diagnostic[]> {
    const existing = await statOrUndefined(absoluteDestinationPath);

    if (existing !== undefined && !existing.isDirectory()) {
      return [
        DestinationWriter.createDestinationUnwritableDiagnostic(
          absoluteDestinationPath,
          'it is a file, and destination names a directory',
        ),
      ];
    }

    if (
      existing !== undefined &&
      !(await DestinationWriter.isReplaceableDirectory(absoluteDestinationPath))
    ) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.DESTINATION_NOT_EMPTY,
          message: `${absoluteDestinationPath} holds files the compiler didn't write, so it won't be replaced. Point destination at a new or empty directory.`,
          file: absoluteDestinationPath,
        }),
      ];
    }

    return [];
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
  }: {
    destination: Destination;
    mirroredFiles: ReadonlyArray<MirroredFile>;
  }): Promise<{
    /** Whether the new Destination Directory replaced the previous one. */
    isWritten: boolean;
    /** Empty when `isWritten`; otherwise the one DESTINATION_UNWRITABLE diagnostic. */
    diagnostics: Diagnostic[];
  }> {
    const temporaryPath = destination.getTemporaryDestination().absolutePath;
    const backupPath = destination.getOldDestination().absolutePath;
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
      // `force` only ignores a missing path, so a parent that is a file (ENOTDIR)
      // would throw here too; the diagnostic below already reports the failure.
      await fsPromises.rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined);
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
    return new Diagnostic({
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
