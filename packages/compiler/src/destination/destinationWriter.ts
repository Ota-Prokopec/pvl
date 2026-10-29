// Whether the Destination Directory can be written where it goes, and
// writing it in one move.
import { checkDestination } from './checkDestination.js';
import { writeDestination } from './writeDestination.js';

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
 * **Output** (`Promise<{ isWritten, diagnostics }>`), one of:
 * - Success: `{ isWritten: true, diagnostics: [] }`.
 * - Failure: `{ isWritten: false, diagnostics: [DESTINATION_UNWRITABLE] }`, the previous
 *   Destination Directory left as it was.
 */
export const DestinationWriter = {
  checkDestination,
  writeDestination,
};
