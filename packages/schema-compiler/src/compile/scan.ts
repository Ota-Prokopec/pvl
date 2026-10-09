// Finds the files `include` selects and reads them statically (ADR-0002):
// nothing scanned is ever imported or executed.
import { glob } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { BACKUP_DESTINATION_SUFFIX, TEMPORARY_DESTINATION_SUFFIX } from './consts.js';
import { DestinationWriter } from './destinationWriter.js';

/**
 * The absolute path of a scanned file. Branded so it can't be mixed up with
 * any other path, such as a mirrored module's or one a module specifier
 * resolves to: `findScanningInputFilePaths` is the only place one is made.
 */
export type ScannedPath = string & { readonly __brand: 'ScannedPath' };

/**
 * What a run scans, and the Destination Directory it must never scan. `compile`
 * builds it from the resolved settings and passes it to `findScanningInputFilePaths`.
 *
 * ```ts
 * { baseDirectory: '/repo', include: ['src/**\/*.ts'], destination: '/repo/.pvl' }
 * ```
 */
export type ScanScope = {
  /** The directory `include` patterns resolve against: the config file's directory, or `cwd` without one. */
  baseDirectory: string;
  /** The config's `include` globs, relative to `baseDirectory`. */
  include: ReadonlyArray<string>;
  /** The Destination Directory's absolute path. */
  destination: string;
};

/**
 * The absolute paths of the files `include` matches under `baseDirectory`,
 * sorted and without duplicates. A matched directory is dropped, and
 * `node_modules`, `destination` and the temporary and backup directories a run
 * keeps beside it are never entered.
 *
 * ```ts
 * // baseDirectory '/repo', destination '/repo/gen'
 * ['src/**\/*.ts']             // ['/repo/src/a.ts', '/repo/src/b/c.ts']
 * ['./src/*.ts', 'src/a.ts']   // ['/repo/src/a.ts']: normalized, then deduplicated
 * ['src/*']                    // ['/repo/src/a.ts']: the directory `src/b` is dropped
 * ['**\/*.ts']                 // skips node_modules/, gen/, gen.pvl-tmp/ and gen.pvl-old/
 * ```
 */
export const findScanningInputFilePaths = async ({
  baseDirectory,
  include,
  destination,
}: ScanScope): Promise<ScannedPath[]> => {
  const files = new Set<ScannedPath>();
  const excludedPaths = new Set([
    destination,
    DestinationWriter.toDestinationSiblingPath(destination, TEMPORARY_DESTINATION_SUFFIX),
    DestinationWriter.toDestinationSiblingPath(destination, BACKUP_DESTINATION_SUFFIX),
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
};

/**
 * The `NO_INPUT_FILES` error a run reports when `include` matched no file,
 * listing every pattern.
 *
 * ```ts
 * createNoInputFilesDiagnostic(['src/*.ts', 'lib/*.ts'])
 * // message: 'include matched no file: `src/*.ts`, `lib/*.ts`.'
 * ```
 */
export const createNoInputFilesDiagnostic = (include: ReadonlyArray<string>): Diagnostic => {
  return createDiagnostic({
    code: DIAGNOSTIC_CODE.NO_INPUT_FILES,
    message: `include matched no file: ${include.map((pattern) => `\`${pattern}\``).join(', ')}.`,
  });
};
