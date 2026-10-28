// Finds the files `include` selects, reading none of them (ADR-0002), and
// reports what `include` raises: a pattern reaching the Destination Directory,
// a symlink, which is never followed, or no file matched.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { NODE_MODULES_DIRECTORY_NAME } from './consts.js';
import type { ScannedPath, ScanPayload, ScanScope } from './types.js';
import {
  createDestinationInsideIncludeDiagnostic,
  createNoInputFilesDiagnostic,
  createSymlinkSkippedDiagnostic,
  findPatternsMatchingPath,
} from './utils.js';

export class Scanner {
  /**
   * The absolute paths of the files `include` matches under `baseDirectory`,
   * sorted and without duplicates, and what `include` raises. A matched
   * directory is dropped, a matched symlink is dropped with a warning, and
   * `node_modules`, `destination` and the temporary and backup directories a
   * run keeps beside it are never entered.
   *
   * ```ts
   * // baseDirectory '/repo', destination.absolutePath '/repo/gen'
   * ['src/**\/*.ts']             // { scannedFilePaths: ['/repo/src/a.ts', '/repo/src/b/c.ts'], diagnostics: [] }
   * ['./src/*.ts', 'src/a.ts']   // { scannedFilePaths: ['/repo/src/a.ts'], … }: deduplicated
   * ['src/*']                    // { scannedFilePaths: ['/repo/src/a.ts'], … }: the directory `src/b` is dropped
   * ['src/*.ts']                 // with src/linked.ts → a.ts: { scannedFilePaths: ['/repo/src/a.ts'], diagnostics: [SYMLINK_SKIPPED] }
   * ['**\/*.ts']                 // skips node_modules/, gen/, gen.pvl-tmp/ and gen.pvl-old/; diagnostics: [DESTINATION_INSIDE_INCLUDE]
   * ['lib/*.ts']                 // { scannedFilePaths: [], diagnostics: [NO_INPUT_FILES] }
   * ```
   */
  public static async scan({
    baseDirectory,
    include,
    destination,
  }: ScanScope): Promise<ScanPayload> {
    const excludedPaths = new Set([
      destination.absolutePath,
      destination.getTemporaryDestination().absolutePath,
      destination.getOldDestination().absolutePath,
    ]);

    const entries = fsPromises.glob(include, {
      cwd: baseDirectory,
      withFileTypes: true,
      exclude: (entry) =>
        entry.name === NODE_MODULES_DIRECTORY_NAME ||
        excludedPaths.has(path.join(entry.parentPath, entry.name)),
    });

    const files = new Set<ScannedPath>();
    const symlinks = new Set<string>();
    for await (const entry of entries) {
      const entryPath = path.join(entry.parentPath, entry.name);
      if (entry.isFile()) {
        files.add(entryPath as ScannedPath);
      } else if (entry.isSymbolicLink()) {
        symlinks.add(entryPath);
      }
    }
    const scannedFilePaths = [...files].sort();

    return {
      scannedFilePaths,
      diagnostics: [
        ...findPatternsMatchingPath(include, destination.relativePath.pathFromBase).map((pattern) =>
          createDestinationInsideIncludeDiagnostic(destination, pattern),
        ),
        ...[...symlinks].sort().map((symlinkPath) => createSymlinkSkippedDiagnostic(symlinkPath)),
        ...(scannedFilePaths.length === 0 ? [createNoInputFilesDiagnostic(include)] : []),
      ],
    };
  }
}
