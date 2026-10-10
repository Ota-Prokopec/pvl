// Finds the files `include` selects and reads them statically (ADR-0002):
// nothing scanned is ever imported or executed.
import { glob } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { DIAGNOSTIC_CODE } from './enums.js';
import { Diagnostic } from './diagnostics/diagnostic.js';
import type { Destination } from './destination/destination.js';

/**
 * The absolute path of a scanned file. Branded so it can't be mixed up with
 * any other path, such as a mirrored module's or one a module specifier
 * resolves to: `Scanner.findScanningInputFilePaths` is the only place one is made.
 */
export type ScannedPath = string & { readonly __brand: 'ScannedPath' };

/**
 * What a run scans, and the Destination Directory it must never scan. `compile`
 * builds it from the resolved settings and passes it to `Scanner.findScanningInputFilePaths`.
 *
 * ```ts
 * { baseDirectory: '/repo', include: ['src/**\/*.ts'], destination: { absolutePath: '/repo/.pvl', … } }
 * ```
 */
export type ScanScope = {
  /** The directory `include` patterns resolve against: the config file's directory, or `cwd` without one. */
  baseDirectory: string;
  /** The config's `include` globs, relative to `baseDirectory`. */
  include: ReadonlyArray<string>;
  /** The Destination Directory, which is never scanned. */
  destination: Destination;
};

export class Scanner {
  /**
   * The absolute paths of the files `include` matches under `baseDirectory`,
   * sorted and without duplicates. A matched directory is dropped, and
   * `node_modules`, `destination` and the temporary and backup directories a run
   * keeps beside it are never entered.
   *
   * ```ts
   * // baseDirectory '/repo', destination.absolutePath '/repo/gen'
   * ['src/**\/*.ts']             // ['/repo/src/a.ts', '/repo/src/b/c.ts']
   * ['./src/*.ts', 'src/a.ts']   // ['/repo/src/a.ts']: normalized, then deduplicated
   * ['src/*']                    // ['/repo/src/a.ts']: the directory `src/b` is dropped
   * ['**\/*.ts']                 // skips node_modules/, gen/, gen.pvl-tmp/ and gen.pvl-old/
   * ```
   */
  public static async findScanningInputFilePaths({
    baseDirectory,
    include,
    destination,
  }: ScanScope): Promise<ScannedPath[]> {
    const files = new Set<ScannedPath>();
    const excludedPaths = new Set([
      destination.absolutePath,
      destination.getTemporaryDestination().absolutePath,
      destination.getOldDestination().absolutePath,
    ]);

    const entries = glob(
      include.map((pattern) => posix.normalize(pattern)),
      {
        cwd: baseDirectory,
        withFileTypes: true,
        exclude: (entry) =>
          entry.name === 'node_modules' || excludedPaths.has(join(entry.parentPath, entry.name)),
      },
    );

    for await (const entry of entries) {
      if (entry.isFile()) {
        files.add(join(entry.parentPath, entry.name) as ScannedPath);
      }
    }
    return [...files].sort();
  }

  /**
   * The `NO_INPUT_FILES` error a run reports when `include` matched no file,
   * listing every pattern.
   *
   * ```ts
   * Scanner.createNoInputFilesDiagnostic(['src/*.ts', 'lib/*.ts'])
   * // message: 'include matched no file: `src/*.ts`, `lib/*.ts`.'
   * ```
   */
  public static createNoInputFilesDiagnostic(include: ReadonlyArray<string>): Diagnostic {
    return new Diagnostic({
      code: DIAGNOSTIC_CODE.NO_INPUT_FILES,
      message: `include matched no file: ${include.map((pattern) => `\`${pattern}\``).join(', ')}.`,
    });
  }
}
