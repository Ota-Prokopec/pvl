// Mirrors the scanned set into the Destination Directory's files (ADR-0005):
// each step lives in its own module, and this one runs them in order.
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { hasError } from '../../diagnostics/diagnostic.js';
import { BARREL_FILE_NAME, GENERATED_HEADER } from '../consts.js';
import { renderBarrel } from './barrel.js';
import { rewriteModuleSpecifiers } from './moduleSpecifiers.js';
import { Precheck } from './precheck.js';
import { readScannedModules } from './scannedModule.js';
import { TsMorphProject } from './tsMorphProject.js';

/** One file the Destination Directory holds. */
export type MirroredFile = {
  /** Its path relative to the Destination Directory, with `/` separators. */
  relativePath: string;
  text: string;
};

export type MirrorScannedFilesPayload = {
  diagnostics: Diagnostic[];
  /** Sorted by path; empty when an error stopped the mirror. */
  mirroredFiles: MirroredFile[];
};

export type MirrorScannedFilesArgs = {
  /** The scanned files' absolute paths. */
  scannedFilePaths: ReadonlyArray<string>;
  /** The base directory, whose `tsconfig.json` supplies alias `paths`. */
  baseDirectory: string;
  /** The Root Directory's absolute path, which the mirror reproduces. */
  rootDirectory: string;
  /** The Destination Directory's absolute path, which module specifiers are rewritten against. */
  destinationDirectory: string;
};

/**
 * Builds the Destination Directory's files from the scanned files (ADR-0005):
 * one mirrored module per scanned file, at its path relative to the Root
 * Directory, under the `@generated` header and with its module specifiers
 * rewritten for its new location, plus the generated barrel unless
 * `<rootDir>/index.ts` is itself scanned.
 *
 * ```ts
 * // /repo/src/schemas/user.ts, /repo/src/schemas/order.ts scanned; rootDir /repo/src
 * mirrorScannedFiles({ …, destinationDirectory: '/repo/.pvl' }).mirroredFiles
 * // [{ relativePath: 'index.ts', … },
 * //  { relativePath: 'schemas/order.ts', … },
 * //  { relativePath: 'schemas/user.ts', … }]
 * ```
 *
 * Returns the warnings with the files, or, when a scanned file can't be
 * mirrored, every error and warning found and no files:
 *
 * - PARSE_FAILED: a file isn't valid syntax. It gets no other diagnostic, as
 *   the tree TypeScript recovers from broken code holds statements nobody
 *   wrote.
 * - FILE_OUTSIDE_ROOT_DIR: a file isn't under the Root Directory.
 * - DEFAULT_EXPORT: a file has a default export.
 * - DUPLICATE_EXPORT: two files export one name bound to different things,
 *   checked only for a generated barrel.
 * - FILE_EXPORTS_NOTHING, SIDE_EFFECT_COPIED: warnings.
 */
export const mirrorScannedFiles = ({
  scannedFilePaths,
  baseDirectory,
  rootDirectory,
  destinationDirectory,
}: MirrorScannedFilesArgs): MirrorScannedFilesPayload => {
  const tsMorphProject = TsMorphProject.create(baseDirectory);
  const scannedModules = readScannedModules({
    tsMorphProject,
    scannedFilePaths,
    rootDirectory,
    destinationDirectory,
  });

  const parseFailures = Precheck.findParseFailuresDiagnostics(tsMorphProject, scannedModules);
  const unparsedFilePaths = new Set(parseFailures.map(({ file }) => file));
  const parsedModules = scannedModules.filter(({ path }) => !unparsedFilePaths.has(path));
  const hasScannedBarrel = scannedModules.some(
    ({ relativePath }) => relativePath === BARREL_FILE_NAME,
  );
  const diagnostics = [
    ...parseFailures,
    ...Precheck.findFilesOutsideRootDirectoryDiagnostics(scannedModules, rootDirectory),
    ...parsedModules.flatMap((scannedModule) =>
      Precheck.findDefaultExportsDiagnostics(scannedModule),
    ),
    ...(hasScannedBarrel ? [] : Precheck.findDuplicateExportsDiagnostics(parsedModules)),
    ...parsedModules.flatMap((scannedModule) => Precheck.findWarningsDiagnostics(scannedModule)),
  ];
  if (hasError(diagnostics)) {
    return { diagnostics, mirroredFiles: [] };
  }

  const mirroredPathByScannedPath = new Map(
    scannedModules.map(({ path, mirroredPath }) => [path, mirroredPath]),
  );
  const mirroredModules: MirroredFile[] = scannedModules.map((scannedModule) => {
    rewriteModuleSpecifiers({ tsMorphProject, scannedModule, mirroredPathByScannedPath });
    return {
      relativePath: scannedModule.relativePath,
      text: `${GENERATED_HEADER}\n${scannedModule.sourceFile.getFullText()}`,
    };
  });

  const barrel: MirroredFile[] = hasScannedBarrel
    ? []
    : [{ relativePath: BARREL_FILE_NAME, text: renderBarrel(scannedModules) }];

  return {
    diagnostics,
    mirroredFiles: [...barrel, ...mirroredModules].sort((first, second) =>
      first.relativePath < second.relativePath ? -1 : 1,
    ),
  };
};
