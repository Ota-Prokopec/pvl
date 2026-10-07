// What stops the scanned set from being mirrored, and what is worth a
// warning when it is. Both read the modules before anything is rewritten.
import { Node, ts, type Project, type Statement } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { isDeclarationStatement } from './context.js';
import { resolveToScannedFile, type ScannedModule } from './tsMorphProject.js';
import { toDisplayPath, findImportCycles } from './utils.js';

// The first syntax error of each module that has one.
const createParseFailureDiagnostics = (
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

// A namespace import or re-export of a scanned file would have to import
// that file again, evaluating it twice, so each is an error instead.
const createNamespaceImportDiagnostics = (
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

// An IMPORT_CYCLE error for each cycle of value imports among the scanned modules.
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
 * The errors that stop the mirror, from the first check that finds any: a
 * file that doesn't parse can't be read for the rest.
 */
export const findBlockingErrors = ({
  tsMorphProject,
  scannedModules,
  scannedFilePaths,
  baseDirectory,
}: FindBlockingErrorsArgs): Diagnostic[] => {
  const parseFailureDiagnostics = createParseFailureDiagnostics(tsMorphProject, scannedModules);
  if (parseFailureDiagnostics.length > 0) {
    return parseFailureDiagnostics;
  }
  const namespaceImportDiagnostics = createNamespaceImportDiagnostics(
    scannedModules,
    scannedFilePaths,
  );
  if (namespaceImportDiagnostics.length > 0) {
    return namespaceImportDiagnostics;
  }
  return importCycleDiagnostics(scannedModules, baseDirectory);
};

// A top-level statement that does something when its module is evaluated,
// rather than declaring a name. An initializer isn't counted: building a
// Schema is exactly that.
const hasTopLevelSideEffect = (statement: Statement): boolean => {
  return !(
    isDeclarationStatement(statement) ||
    Node.isImportDeclaration(statement) ||
    Node.isExportDeclaration(statement) ||
    Node.isExportAssignment(statement) ||
    Node.isEmptyStatement(statement)
  );
};

// Whether any of the statements exports a name, by `export` on a declaration,
// `export { … }`, `export … from` or `export default`.
const hasAnyExport = (topLevelStatements: ReadonlyArray<Statement>): boolean => {
  return topLevelStatements.some(
    (statement) =>
      Node.isExportDeclaration(statement) ||
      Node.isExportAssignment(statement) ||
      (Node.isExportable(statement) && statement.hasExportKeyword()),
  );
};

/** The warnings about what one module brings into the Destination File. */
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
