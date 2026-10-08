// Finds the files `include` selects and reads them statically (ADR-0002):
// nothing scanned is ever imported or executed.
import { glob } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { DIAGNOSTIC_CODE } from '../diagnostics/consts.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';

/** What a run scans, and the destination it must never scan. */
export type ScanScope = {
  /** The directory relative paths resolve against. */
  baseDirectory: string;
  include: ReadonlyArray<string>;
  /** The Destination Directory's absolute path. */
  destination: string;
};

/**
 * The absolute paths `include` matches under `baseDirectory`, sorted. `node_modules`
 * and `destination` are never matched.
 */
export const findInputFiles = async ({
  baseDirectory,
  include,
  destination,
}: ScanScope): Promise<string[]> => {
  const files = new Set<string>();
  const entries = glob(
    include.map((pattern) => posix.normalize(pattern)),
    {
      cwd: baseDirectory,
      withFileTypes: true,
      exclude: (entry) =>
        entry.name === 'node_modules' || join(entry.parentPath, entry.name) === destination,
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
