import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import {
  DEFAULT_DESTINATION_GITIGNORE_TEXT,
  GENERATED_MARKER_FILE_NAME,
  GENERATED_MARKER_TEXT,
  GITIGNORE_FILE_NAME,
} from './consts.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import type { MirroredFile } from '../module/types.js';
import { errorMessage } from '../errorMessage.js';
import type { Destination } from './destination.js';
import { createDestinationUnwritableDiagnostic, statOrUndefined } from './utils.js';

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
export const writeDestination = async ({
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
}> => {
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

    // Every directory a file goes in, each created once.
    const temporaryPaths = new Set(
      filesToWrite.map(({ relativePath }) => path.dirname(path.join(temporaryPath, relativePath))),
    );
    await Promise.all(
      [...temporaryPaths].map((directoryPath) =>
        fsPromises.mkdir(directoryPath, { recursive: true }),
      ),
    );
    // Then every file, into the directories that now exist.
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
        createDestinationUnwritableDiagnostic(destination.absolutePath, errorMessage(error)),
      ],
    };
  }
  await fsPromises.rm(backupPath, { recursive: true, force: true });

  return { isWritten: true, diagnostics: [] };
};
