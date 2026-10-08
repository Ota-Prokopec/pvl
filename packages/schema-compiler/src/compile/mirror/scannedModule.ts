// One scanned file as the mirror sees it: its parsed source and where it
// lands in the Destination Directory.
import { isAbsolute, join, relative } from 'node:path';
import type { Project, SourceFile } from 'ts-morph';
import { toPosixPath } from './utils.js';

/** One scanned file. */
export type ScannedModule = {
  /** The file's absolute path. */
  path: string;
  /** Its ts-morph source file, which the mirror reads and rewrites in place. */
  sourceFile: SourceFile;
  /** Its path relative to the Root Directory, with `/` separators: also its path inside the Destination Directory. */
  relativePath: string;
  /** The absolute path of its mirrored module. */
  mirroredPath: string;
};

export type ReadScannedModulesArgs = {
  tsMorphProject: Project;
  /** The scanned files' absolute paths. */
  scannedFilePaths: ReadonlyArray<string>;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
  /** The Destination Directory's absolute path. */
  destinationDirectory: string;
};

/**
 * Adds each scanned file to `tsMorphProject` and places it in the mirror,
 * keeping the order of `scannedFilePaths`. A file outside the Root Directory
 * gets a `relativePath` starting with `..` (or an absolute one, on another
 * drive), which FILE_OUTSIDE_ROOT_DIR reports.
 *
 * With Root Directory `/repo/src` and Destination Directory `/repo/.pvl`:
 *
 * ```ts
 * readScannedModules({ …, scannedFilePaths: ['/repo/src/schemas/user.ts'] })
 * // [{ path: '/repo/src/schemas/user.ts', sourceFile: <user.ts>,
 * //    relativePath: 'schemas/user.ts', mirroredPath: '/repo/.pvl/schemas/user.ts' }]
 * ```
 *
 * Throws ts-morph's error when a path can't be read from disk.
 */
export const readScannedModules = ({
  tsMorphProject,
  scannedFilePaths,
  rootDirectory,
  destinationDirectory,
}: ReadScannedModulesArgs): ScannedModule[] => {
  return scannedFilePaths.map((path) => {
    const relativePath = toPosixPath(relative(rootDirectory, path));
    return {
      path,
      sourceFile: tsMorphProject.addSourceFileAtPath(path),
      relativePath,
      mirroredPath: join(destinationDirectory, relativePath),
    };
  });
};

/**
 * Whether a path relative to the Root Directory leads outside it, so the
 * file there has no place in the mirror.
 *
 * ```ts
 * isOutsideRootDirectory('schemas/user.ts') // false
 * isOutsideRootDirectory('../lib/user.ts')  // true
 * ```
 */
export const isOutsideRootDirectory = (relativePath: string): boolean => {
  return relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath);
};
