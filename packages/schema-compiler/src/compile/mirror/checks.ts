// What stops the scanned set from being mirrored, and what is worth a
// warning when it is. Both read the modules before anything is rewritten.
import { Node, ts, type Project, type Statement } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { isDeclarationStatement } from './context.js';
import { resolveToScannedFile, type ScannedModule } from './tsMorphProject.js';
import { toDisplayPath, findImportCycles } from './utils.js';

// A PARSE_FAILED error for each scanned file that isn't valid syntax, read
// from the TypeScript compiler's syntactic diagnostics. Only a file's first
// syntax error is reported, as the later ones are usually its knock-on
// effects.
//
//   // src/schemas/user.ts
//   export const user = pvl.object({ name: pvl.string() ;
//
//   → PARSE_FAILED: This file doesn't parse, so it can't be mirrored:
//     ',' expected. (line 2).
//
// Only syntax is checked: a type error such as `const age: number = 'x'`
// parses fine and isn't reported.
const syntacticDiagnostics = (
  tsMorphProject: Project,
  scannedModules: ReadonlyArray<ScannedModule>,
): Diagnostic[] => {
  return scannedModules.flatMap(({ path, sourceFile }) =>
    tsMorphProject
      .getProgram()
      .getSyntacticDiagnostics(sourceFile)
      .slice(0, 1)
      .map((syntaxDiagnostic) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.PARSE_FAILED,
          message: `This file doesn't parse, so it can't be mirrored: ${ts.flattenDiagnosticMessageText(syntaxDiagnostic.compilerObject.messageText, ' ')} (line ${String(syntaxDiagnostic.getLineNumber())}).`,
          file: path,
        }),
      ),
  );
};

// A NAMESPACE_IMPORT_OF_SCANNED_FILE error for each namespace import or
// re-export whose specifier resolves to a scanned file. The Destination File
// holds that file's exports as plain top-level bindings, with no module
// object a namespace could refer to; keeping the import would evaluate the
// file a second time.
//
//   import * as schemas from './user.js';    // blocked: user.ts is scanned
//   export * as schemas from './user.js';    // blocked: user.ts is scanned
//   import { user } from './user.js';        // fine: collapses into `user`
//   import * as path from 'node:path';       // fine: not a scanned file
//   import * as helpers from '../helpers.js'; // fine when helpers.ts isn't scanned
const namespaceImportDiagnostics = (
  scannedModules: ReadonlyArray<ScannedModule>,
  scannedFilePaths: ReadonlySet<string>,
): Diagnostic[] => {
  return scannedModules.flatMap(({ path, sourceFile }) =>
    [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
      .filter((declaration) => {
        const moduleSpecifier = declaration.getModuleSpecifierValue();
        const namespaceNode = Node.isImportDeclaration(declaration)
          ? declaration.getNamespaceImport()
          : declaration.getNamespaceExport();
        return (
          namespaceNode !== undefined &&
          moduleSpecifier !== undefined &&
          resolveToScannedFile(moduleSpecifier, path, scannedFilePaths) !== undefined
        );
      })
      .map((declaration) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.NAMESPACE_IMPORT_OF_SCANNED_FILE,
          message: `The namespace import on line ${String(declaration.getStartLineNumber())} names a scanned file, whose exports the Destination File holds directly. Import the names you use instead.`,
          file: path,
        }),
      ),
  );
};

// An IMPORT_CYCLE error for each cycle of value imports among the scanned
// files, reported on the cycle's first file. In the Destination File every
// module's code runs top to bottom once, so one module of a cycle would read
// another's export before its `const` has run.
//
//   // a.ts                              // b.ts
//   import { b } from './b.js';          import { a } from './a.js';
//   export const a = pvl.array(b);       export const b = pvl.array(a);
//
//   → IMPORT_CYCLE: … src/a.ts → src/b.ts → src/a.ts. Break the cycle, or
//     make an import type-only.
//
// A type-only import is erased, so it never closes a cycle:
//
//   import type { B } from './b.js';     // not a cycle edge
const importCycleDiagnostics = (
  scannedModules: ReadonlyArray<ScannedModule>,
  baseDirectory: string,
): Diagnostic[] => {
  return findImportCycles(scannedModules).map((cyclePaths) =>
    createDiagnostic({
      code: DIAGNOSTIC_CODE.IMPORT_CYCLE,
      message: `These scanned files import each other, so one would read another's exports before they exist in the Destination File: ${cyclePaths.map((path) => toDisplayPath(baseDirectory, path)).join(' → ')}. Break the cycle, or make an import type-only.`,
      file: cyclePaths[0],
    }),
  );
};

export type FindBlockingErrorsArgs = {
  tsMorphProject: Project;
  scannedModules: ReadonlyArray<ScannedModule>;
  scannedFilePaths: ReadonlySet<string>;
  baseDirectory: string;
};

/**
 * The errors that stop the mirror, from the first of three checks that finds
 * any, in this order:
 *
 * 1. PARSE_FAILED: a scanned file isn't valid syntax.
 * 2. NAMESPACE_IMPORT_OF_SCANNED_FILE: `import * as x from './scanned.js'`.
 * 3. IMPORT_CYCLE: scanned files import each other's values.
 *
 * A later check reads the syntax trees an earlier one found broken, so it
 * runs only when every earlier check passed. An empty result means the
 * scanned set can be mirrored.
 */
export const findBlockingErrors = ({
  tsMorphProject,
  scannedModules,
  scannedFilePaths,
  baseDirectory,
}: FindBlockingErrorsArgs): Diagnostic[] => {
  const parseFailures = syntacticDiagnostics(tsMorphProject, scannedModules);
  if (parseFailures.length > 0) {
    return parseFailures;
  }
  const namespaceImportsOfScannedFiles = namespaceImportDiagnostics(
    scannedModules,
    scannedFilePaths,
  );
  if (namespaceImportsOfScannedFiles.length > 0) {
    return namespaceImportsOfScannedFiles;
  }
  return importCycleDiagnostics(scannedModules, baseDirectory);
};

// Whether a top-level statement does something when its module is
// evaluated, rather than only declaring a name. A declaration's initializer
// doesn't count, since building a Schema is exactly that.
//
//   console.log('loaded');                 // side effect
//   registry.add(user);                    // side effect
//   if (debug) { … }                       // side effect
//   export const user = pvl.object({ … }); // declaration: no
//   import { pvl } from '@pvl/schema';     // import: no
//   export { user as account };            // export: no
const hasTopLevelSideEffect = (statement: Statement): boolean => {
  return !(
    isDeclarationStatement(statement) ||
    Node.isImportDeclaration(statement) ||
    Node.isExportDeclaration(statement) ||
    Node.isExportAssignment(statement) ||
    Node.isEmptyStatement(statement)
  );
};

// Whether any of the top-level statements exports a name, in any form:
//
//   export const user = …;        export { user };
//   export * from './user.js';    export default user;
//
// A file of only `const internal = 1;` exports nothing.
const hasAnyExport = (topLevelStatements: ReadonlyArray<Statement>): boolean => {
  return topLevelStatements.some(
    (statement) =>
      Node.isExportDeclaration(statement) ||
      Node.isExportAssignment(statement) ||
      (Node.isExportable(statement) && statement.hasExportKeyword()),
  );
};

/**
 * The warnings about what one scanned module brings into the Destination
 * File. Neither stops the mirror; `--strict` turns them into errors.
 *
 * - FILE_EXPORTS_NOTHING: the file has no export, so nothing in it can be
 *   imported from the Destination File (`const internal = 1;` alone).
 * - SIDE_EFFECT_COPIED: one per top-level statement that runs code, such as
 *   `console.log('loaded');`, which now runs in the Destination File too.
 */
export const createModuleWarnings = ({ path, sourceFile }: ScannedModule): Diagnostic[] => {
  const topLevelStatements = sourceFile.getStatements();
  const exportsNothingWarnings = hasAnyExport(topLevelStatements)
    ? []
    : [
        createDiagnostic({
          code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
          message: 'This file exports nothing, so the Destination File mirrors nothing from it.',
          file: path,
        }),
      ];
  const sideEffectWarnings = topLevelStatements.filter(hasTopLevelSideEffect).map((statement) =>
    createDiagnostic({
      code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
      message: `The top-level statement on line ${String(statement.getStartLineNumber())} is copied into the Destination File, so it now runs from two modules.`,
      file: path,
    }),
  );
  return [...exportsNothingWarnings, ...sideEffectWarnings];
};
