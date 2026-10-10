// Every error and warning the scanned modules raise, found before any source
// file is rewritten, and the compilation of each module that parses.
import type { Project } from 'ts-morph';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import {
  ScannedModuleCompiler,
  type MarkedToCompileSchemaSite,
} from './generate/scannedModuleCompiler.js';
import { Barrel } from '../barrel.js';
import { Precheck } from '../precheck.js';
import type { Module } from '../module.js';

/** A parsed scanned module with its `pvl.compile(...)` calls read, ready to be compiled in place. */
export type ScannedModuleCompilation = {
  scannedModule: Module;
  scannedModuleCompiler: ScannedModuleCompiler;
  /** Its `pvl.compile(...)` calls that compile. */
  sites: MarkedToCompileSchemaSite[];
  /** The errors of its `pvl.compile(...)` calls that don't. */
  diagnostics: Diagnostic[];
};

export type PrecheckScannedModulesPayload = {
  diagnostics: Diagnostic[];
  /** One per scanned module that parses, in scan order. */
  compilations: ScannedModuleCompilation[];
};

export type PrecheckScannedModulesArgs = {
  tsMorphProject: Project;
  scannedModules: ReadonlyArray<Module>;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
};

/**
 * Every error and warning the scanned modules raise, collected before any
 * source file is touched so one run reports all the problems instead of
 * stopping at the first, with the compilation of each module that parses.
 *
 * A file with syntax errors gets PARSE_FAILED and nothing else, and has no
 * compilation: the tree TypeScript recovers from broken code holds
 * statements nobody wrote, so every later check runs on the parsed modules
 * only.
 *
 * - PARSE_FAILED: a file isn't valid syntax.
 * - FILE_OUTSIDE_ROOT_DIR: a file isn't under the Root Directory.
 * - DEFAULT_EXPORT: a file has a default export.
 * - DUPLICATE_EXPORT: two files export one name bound to different things,
 *   checked only for a generated barrel.
 * - COMPILE_ARGUMENT_UNRESOLVABLE, COMPILE_ARGUMENT_NOT_COMPOSITE,
 *   COMPILE_RESULT_MODIFIED, UNSUPPORTED_SCHEMA: a `pvl.compile(...)` call
 *   can't be compiled (see ScannedModuleCompiler.readMarkedToCompileSchemas).
 * - FILE_EXPORTS_NOTHING, SIDE_EFFECT_COPIED: warnings.
 *
 * ```ts
 * // user.ts parses, broken.ts doesn't
 * precheckScannedModules({ …, scannedModules: [<user.ts>, <broken.ts>] })
 * // { diagnostics: [PARSE_FAILED (broken.ts), …user.ts's diagnostics],
 * //   compilations: [{ scannedModule: <user.ts>, … }] }
 * ```
 */
export const precheckScannedModules = ({
  tsMorphProject,
  scannedModules,
  rootDirectory,
}: PrecheckScannedModulesArgs): PrecheckScannedModulesPayload => {
  const parseFailuresDiagnostics = Precheck.findParseFailuresDiagnostics(
    tsMorphProject,
    scannedModules,
  );

  const unparsedFilePaths: ReadonlySet<string | undefined> = new Set(
    parseFailuresDiagnostics.map(({ file }) => file),
  );
  const parsedModules = scannedModules.filter(
    ({ absolutePath }) => !unparsedFilePaths.has(absolutePath),
  );

  // Read each parsed file's `pvl.compile(...)` calls up front: their
  // diagnostics decide whether the run compiles, and their sites are compiled
  // once it does.
  const compilations: ScannedModuleCompilation[] = parsedModules.map((scannedModule) => {
    const scannedModuleCompiler = new ScannedModuleCompiler(scannedModule);
    return {
      scannedModule,
      scannedModuleCompiler,
      ...scannedModuleCompiler.readMarkedToCompileSchemas(),
    };
  });

  return {
    diagnostics: [
      ...parseFailuresDiagnostics,
      ...Precheck.findFilesOutsideRootDirectoryDiagnostics(scannedModules, rootDirectory),
      ...parsedModules.flatMap((scannedModule) =>
        Precheck.findDefaultExportsDiagnostics(scannedModule),
      ),
      // A scanned `<rootDir>/index.ts` replaces the generated barrel, so no
      // export can clash in it.
      ...(Barrel.hasScannedBarrel(scannedModules)
        ? []
        : Precheck.findDuplicateExportsDiagnostics(parsedModules)),
      ...parsedModules.flatMap((scannedModule) => Precheck.findWarningsDiagnostics(scannedModule)),
      ...compilations.flatMap(({ diagnostics }) => diagnostics),
    ],
    compilations,
  };
};
