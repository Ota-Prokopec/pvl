// Finds the files `include` selects and reads them statically (ADR-0002):
// nothing scanned is ever imported or executed.
import { glob } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { BACKUP_DESTINATION_SUFFIX, TEMPORARY_DESTINATION_SUFFIX } from './consts.js';
import { toDestinationSiblingPath } from './destination.js';

/** What a run scans, and the destination it must never scan. */
export type ScanScope = {
  /** The directory relative paths resolve against. */
  baseDirectory: string;
  include: ReadonlyArray<string>;
  /** The Destination Directory's absolute path. */
  destination: string;
};

/**
 * The absolute paths `include` matches under `baseDirectory`, sorted.
 * `node_modules`, `destination` and the temporary and backup directories a
 * run keeps beside it (`<destination>.pvl-tmp`, `<destination>.pvl-old`) are
 * never matched.
 */
export const findScanningInputFilePaths = async ({
  baseDirectory,
  include,
  destination,
}: ScanScope): Promise<string[]> => {
  const files = new Set<string>();
  const excludedPaths = new Set([
    destination,
    toDestinationSiblingPath(destination, TEMPORARY_DESTINATION_SUFFIX),
    toDestinationSiblingPath(destination, BACKUP_DESTINATION_SUFFIX),
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
      files.add(join(entry.parentPath, entry.name));
    }
  }
  return [...files].sort();
};

export const createNoInputFilesDiagnostic = (include: ReadonlyArray<string>): Diagnostic => {
  return createDiagnostic({
    code: DIAGNOSTIC_CODE.NO_INPUT_FILES,
    message: `include matched no file: ${include.map((pattern) => `\`${pattern}\``).join(', ')}.`,
  });
};
