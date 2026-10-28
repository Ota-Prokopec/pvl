// Finds the files `include` selects, reading none of them (ADR-0002), and
// reports what `include` raises: a pattern reaching the Destination Directory,
// or no file matched.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { NODE_MODULES_DIRECTORY_NAME } from './consts.js';
import type { ScannedPath, ScanPayload, ScanScope } from './types.js';
import {
  createDestinationInsideIncludeDiagnostic,
  createNoInputFilesDiagnostic,
  findPatternsMatchingPath,
} from './utils.js';

export class Scanner {
  /**
   * The absolute paths of the files `include` matches under `baseDirectory`,
   * sorted and without duplicates, and what `include` raises. A matched
   * directory is dropped, and `node_modules`, `destination` and the temporary
   * and backup directories a run keeps beside it are never entered.
   *
   * ```ts
   * // baseDirectory '/repo', destination.absolutePath '/repo/gen'
   * ['src/**\/*.ts']             // { scannedFilePaths: ['/repo/src/a.ts', '/repo/src/b/c.ts'], diagnostics: [] }
   * ['./src/*.ts', 'src/a.ts']   // { scannedFilePaths: ['/repo/src/a.ts'], … }: deduplicated
   * ['src/*']                    // { scannedFilePaths: ['/repo/src/a.ts'], … }: the directory `src/b` is dropped
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
    for await (const entry of entries) {
      if (entry.isFile()) {
        files.add(path.join(entry.parentPath, entry.name) as ScannedPath);
      }
    }
    const scannedFilePaths = [...files].sort();

    return {
      scannedFilePaths,
      diagnostics: [
        ...findPatternsMatchingPath(include, destination.relativePath.pathFromBase).map((pattern) =>
          createDestinationInsideIncludeDiagnostic(destination, pattern),
        ),
        ...(scannedFilePaths.length === 0 ? [createNoInputFilesDiagnostic(include)] : []),
      ],
    };
  }
}
