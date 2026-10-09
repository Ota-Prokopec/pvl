// One scanned file as the mirror sees it: its parsed source and where it
// lands in the Destination Directory.
import { isAbsolute, join, relative } from 'node:path';
import type { Project, SourceFile } from 'ts-morph';
import { toPosixPath } from './utils.js';
import type { Destination } from '../destinationWriter.js';
import type { Path } from '../path.js';
import type { ScannedPath } from '../scan.js';

/**
 * The absolute path of a scanned file's mirrored module. Branded so it can't
 * be mixed up with the scanned file's own path: `getScannedModules` is the
 * only place one is made.
 */
export type MirroredPath = string & { readonly __brand: 'MirroredPath' };

/**
 * One scanned file. Its `relative.path` is relative to the Root Directory,
 * which is also its path inside the Destination Directory.
 */
export type ScannedModule = Required<Path> & {
  /** The file's absolute path. */
  absolutePath: ScannedPath;
  /** Its ts-morph source file, which the mirror reads and rewrites in place. */
  sourceFile: SourceFile;
  /** The absolute path of its mirrored module. */
  mirroredPath: MirroredPath;
};

export type ReadScannedModulesArgs = {
  tsMorphProject: Project;
  /** The scanned files' absolute paths. */
  scannedFilePaths: ReadonlyArray<ScannedPath>;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
  destination: Destination;
};

/**
 * Adds each scanned file to `tsMorphProject` and places it in the mirror,
 * keeping the order of `scannedFilePaths`. A file outside the Root Directory
 * gets a `relative.path` starting with `..` (or an absolute one, on another
 * drive), which FILE_OUTSIDE_ROOT_DIR reports.
 *
 * With Root Directory `/repo/src` and Destination Directory `/repo/.pvl`:
 *
 * ```ts
 * getScannedModules({ …, scannedFilePaths: ['/repo/src/schemas/user.ts'] })
 * // [{ absolutePath: '/repo/src/schemas/user.ts',
 * //    relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' },
 * //    sourceFile: <user.ts>, mirroredPath: '/repo/.pvl/schemas/user.ts' }]
 * ```
 *
 * Throws ts-morph's error when a path can't be read from disk.
 */
export const getScannedModules = ({
  tsMorphProject,
  scannedFilePaths,
  rootDirectory,
  destination,
}: ReadScannedModulesArgs): ScannedModule[] => {
  return scannedFilePaths.map((path) => {
    const relativePath = toPosixPath(relative(rootDirectory, path));
    return {
      absolutePath: path,
      relative: { absoluteBase: rootDirectory, path: relativePath },
      sourceFile: tsMorphProject.addSourceFileAtPath(path),
      mirroredPath: join(destination.absolutePath, relativePath) as MirroredPath,
    };
  });
};

/**
 * Whether a path's `relative.path`, relative to the Root Directory, leads
 * outside it, so the file there has no place in the mirror.
 *
 * ```ts
 * isOutsideRootDirectory({ …, relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' } }) // false
 * isOutsideRootDirectory({ …, relative: { absoluteBase: '/repo/src', path: '../lib/user.ts' } })  // true
 * ```
 */
export const isOutsideRootDirectory = ({ relative: { path } }: Required<Path>): boolean => {
  return path === '..' || path.startsWith('../') || isAbsolute(path);
};
