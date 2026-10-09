// Mirrors the scanned set into the Destination Directory's files (ADR-0005):
// each step lives in its own module, and this one runs them in order.
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { hasError } from '../../diagnostics/diagnostic.js';
import { BARREL_FILE_NAME, GENERATED_HEADER } from '../consts.js';
import type { Destination } from '../destinationWriter.js';
import { ScannedModuleCompiler } from '../generate/scannedModuleCompiler.js';
import type { ScannedPath } from '../scan.js';
import { renderBarrel } from './barrel.js';
import { ModuleSpecifier } from './moduleSpecifier.js';
import { Precheck } from './precheck.js';
import { getScannedModules, type MirroredPath, type ScannedModule } from './scannedModule.js';
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
  scannedFilePaths: ReadonlyArray<ScannedPath>;
  /** The base directory, whose `tsconfig.json` supplies alias `paths`. */
  baseDirectory: string;
  /** The Root Directory's absolute path, which the mirror reproduces. */
  rootDirectory: string;
  /** The Destination Directory, whose absolute path module specifiers are rewritten against. */
  destination: Destination;
};

/**
 * Builds the Destination Directory's files from the scanned files (ADR-0005):
 * one mirrored module per scanned file, at its path relative to the Root
 * Directory, under the `@generated` header and with its module specifiers
 * rewritten for its new location and each `pvl.compile(...)` call compiled
 * to straight-line code, plus the generated barrel unless
 * `<rootDir>/index.ts` is itself scanned.
 *
 * ```ts
 * // /repo/src/schemas/user.ts, /repo/src/schemas/order.ts scanned; rootDir /repo/src
 * mirrorScannedFiles({ …, destination: { absolutePath: '/repo/.pvl', … } }).mirroredFiles
 * // [{ relativePath: 'index.ts', … },
 * //  { relativePath: 'schemas/order.ts', … },
 * //  { relativePath: 'schemas/user.ts', … }]
 * ```
 *
 * Returns the warnings with the files, or, when a scanned file can't be
 * mirrored, every error and warning found and no files:
 *
 * - TSCONFIG_UNREADABLE: `<baseDirectory>/tsconfig.json` can't be read, so
 *   alias imports can't be resolved. Reported alone, before any file is read.
 * - PARSE_FAILED: a file isn't valid syntax. It gets no other diagnostic, as
 *   the tree TypeScript recovers from broken code holds statements nobody
 *   wrote.
 * - FILE_OUTSIDE_ROOT_DIR: a file isn't under the Root Directory.
 * - DEFAULT_EXPORT: a file has a default export.
 * - DUPLICATE_EXPORT: two files export one name bound to different things,
 *   checked only for a generated barrel.
 * - COMPILE_ARGUMENT_UNRESOLVABLE, COMPILE_ARGUMENT_NOT_COMPOSITE,
 *   COMPILE_RESULT_MODIFIED, UNSUPPORTED_SCHEMA: a `pvl.compile(...)` call
 *   can't be compiled (see ScannedModuleCompiler.readMarkedToCompileSchemas).
 * - FILE_EXPORTS_NOTHING, SIDE_EFFECT_COPIED: warnings.
 */
export const mirrorScannedFiles = ({
  scannedFilePaths,
  baseDirectory,
  rootDirectory,
  destination,
}: MirrorScannedFilesArgs): MirrorScannedFilesPayload => {
  const { tsMorphProject, diagnostics: tsMorphProjectCreateDiagnostics } =
    TsMorphProject.create(baseDirectory); //TODO: Maybe move the TS-morph project creation into compile function.

  if (tsMorphProject === undefined) {
    return { diagnostics: tsMorphProjectCreateDiagnostics, mirroredFiles: [] };
  }

  const scannedModules: ScannedModule[] = getScannedModules({
    destination,
    rootDirectory,
    scannedFilePaths,
    tsMorphProject,
  });

  // Lets a rewritten import that points at another scanned file point at that
  // file's mirror instead.
  const mirroredPathByScannedPath = new Map<string, MirroredPath>(
    scannedModules.map(({ absolutePath, mirroredPath }) => [absolutePath, mirroredPath]),
  );

  // A file with syntax errors gets PARSE_FAILED and nothing else: the tree
  // TypeScript recovers from broken code holds statements nobody wrote, so
  // every later check runs on the parsed modules only.
  const parseFailuresDiagnostics = Precheck.findParseFailuresDiagnostics(
    tsMorphProject,
    scannedModules,
  );

  const unparsedFilePaths: Set<string | undefined> = new Set(
    parseFailuresDiagnostics.map(({ file }) => file),
  );
  const parsedModules = scannedModules.filter(
    ({ absolutePath }) => !unparsedFilePaths.has(absolutePath),
  );

  // A scanned `<rootDir>/index.ts` is mirrored like any other file and replaces
  // the generated barrel, which also skips the barrel's DUPLICATE_EXPORT check.
  const hasScannedBarrel = scannedModules.some(
    ({ relative }) => relative.path === BARREL_FILE_NAME,
  );

  // Read each parsed file's `pvl.compile(...)` calls up front: their diagnostics
  // decide whether the mirror runs, and their compiled code is applied below.
  const markedToCompileSchemasByPath = new Map(
    parsedModules.map((scannedModule) => {
      const scannedModuleCompiler = new ScannedModuleCompiler(scannedModule);
      return [
        scannedModule.absolutePath,
        { scannedModuleCompiler, ...scannedModuleCompiler.readMarkedToCompileSchemas() },
      ];
    }),
  );

  // Collect every error and warning before touching any source file, so one
  // run reports all the problems instead of stopping at the first.
  const diagnostics = [
    ...parseFailuresDiagnostics,
    ...Precheck.findFilesOutsideRootDirectoryDiagnostics(scannedModules, rootDirectory),
    ...parsedModules.flatMap((scannedModule) =>
      Precheck.findDefaultExportsDiagnostics(scannedModule),
    ),
    ...(hasScannedBarrel ? [] : Precheck.findDuplicateExportsDiagnostics(parsedModules)),
    ...parsedModules.flatMap((scannedModule) => Precheck.findWarningsDiagnostics(scannedModule)),
    ...[...markedToCompileSchemasByPath.values()].flatMap(
      ({ diagnostics: markedToCompileSchemaDiagnostics }) => markedToCompileSchemaDiagnostics,
    ),
  ];

  // Any error means no file is written; warnings alone let the mirror go ahead.
  if (hasError(diagnostics)) {
    return { diagnostics, mirroredFiles: [] };
  }

  // Turn each source file into its mirror by editing it in place: replace its
  // `pvl.compile(...)` calls with straight-line code, point its module
  // specifiers at the right files from the mirrored location, then prepend
  // the `@generated` header.
  const mirroredModules: MirroredFile[] = scannedModules.map((scannedModule) => {
    const markedToCompileSchemas = markedToCompileSchemasByPath.get(scannedModule.absolutePath);
    markedToCompileSchemas?.scannedModuleCompiler.applyCompiledSchemas(
      markedToCompileSchemas.sites,
    );

    new ModuleSpecifier({
      tsMorphProject,
      scannedModule,
      mirroredPathByScannedPath,
    }).rewriteModuleSpecifiers();

    return {
      relativePath: scannedModule.relative.path,
      text: `${GENERATED_HEADER}\n${scannedModule.sourceFile.getFullText()}`,
    };
  });

  const barrel: MirroredFile[] = hasScannedBarrel
    ? []
    : [{ relativePath: BARREL_FILE_NAME, text: renderBarrel(scannedModules) }];

  // Sort by path so the output doesn't depend on scan order.
  return {
    diagnostics,
    mirroredFiles: [...barrel, ...mirroredModules].sort((first, second) =>
      first.relativePath < second.relativePath ? -1 : 1,
    ),
  };
};
