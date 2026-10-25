import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { statOrUndefined } from '../utils.js';

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
export const checkDestination = async (absoluteDestinationPath: string): Promise<Diagnostic[]> => {
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
};
