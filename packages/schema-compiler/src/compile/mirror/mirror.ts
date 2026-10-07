// Mirrors the scanned set into the Destination File's text (ADR-0005). The
// modules share the file's one top-level scope: imports from outside the
// set are hoisted and merged, an import into the set collapses into a
// reference to the binding it names, and a non-exported name two modules
// both use is renamed in the later one.
import { relative } from 'node:path';
import { Node, SyntaxKind, ts, type Project, type SourceFile, type Statement } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { GENERATED_HEADER } from '../consts.js';
import { isDeclaration, readContext, type ImportBinding, type ModuleContext } from './context.js';
import { planExports, rewriteExports } from './exports.js';
import { renderImports } from './imports.js';
import {
  createProject,
  emissionOrder,
  findCycles,
  readModules,
  resolveScanned,
  rewriteSpecifier,
  toPosix,
  type ScannedModule,
} from './modules.js';
import { createOriginResolver, ORIGIN_KIND, originKey, type LocalOrigin } from './origins.js';
import { assignNames } from './scope.js';

export type MirrorPayload = {
  diagnostics: Diagnostic[];
  /** The Destination File's text; empty when an error stopped the mirror. */
  content: string;
};

// A top-level statement that does something when its module is evaluated,
// rather than declaring a name. An initializer isn't counted: building a
// Schema is exactly that.
const isSideEffecting = (statement: Statement): boolean => {
  return !(
    isDeclaration(statement) ||
    Node.isImportDeclaration(statement) ||
    Node.isExportDeclaration(statement) ||
    Node.isExportAssignment(statement) ||
    Node.isEmptyStatement(statement)
  );
};

const exportsSomething = (statements: ReadonlyArray<Statement>): boolean => {
  return statements.some(
    (statement) =>
      Node.isExportDeclaration(statement) ||
      Node.isExportAssignment(statement) ||
      (Node.isExportable(statement) && statement.hasExportKeyword()),
  );
};

// The first syntax error of each module that has one.
const findParseFailures = (
  project: Project,
  modules: ReadonlyArray<ScannedModule>,
): Diagnostic[] => {
  return modules.flatMap(({ path, sourceFile }) =>
    project
      .getProgram()
      .getSyntacticDiagnostics(sourceFile)
      .slice(0, 1)
      .map((failure) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.PARSE_FAILED,
          message: `This file doesn't parse, so it can't be mirrored: ${ts.flattenDiagnosticMessageText(failure.compilerObject.messageText, ' ')} (line ${String(failure.getLineNumber())}).`,
          file: path,
        }),
      ),
  );
};

// A namespace import or re-export of a scanned file would have to import
// that file again, evaluating it twice, so each is an error instead.
const findNamespaceImports = (
  modules: ReadonlyArray<ScannedModule>,
  scanned: ReadonlySet<string>,
): Diagnostic[] => {
  return modules.flatMap(({ path, sourceFile }) =>
    [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
      .filter((declaration) => {
        const specifier = declaration.getModuleSpecifierValue();
        const namespace = Node.isImportDeclaration(declaration)
          ? declaration.getNamespaceImport()
          : declaration.getNamespaceExport();
        return (
          namespace !== undefined &&
          specifier !== undefined &&
          resolveScanned(specifier, path, scanned) !== undefined
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

// Rewrites the specifiers that stay in a module's body, a dynamic `import()`
// and an `import x = require()`, to resolve from the destination.
const rewriteInlineSpecifiers = (sourceFile: SourceFile, outputDirectory: string): void => {
  const path = sourceFile.getFilePath();
  const literals = [
    ...sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
      .map((call) => call.getArguments()[0]),
    ...sourceFile.getStatements().flatMap((statement) => {
      const reference = Node.isImportEqualsDeclaration(statement)
        ? statement.getModuleReference()
        : undefined;
      return Node.isExternalModuleReference(reference) ? [reference.getExpression()] : [];
    }),
  ];
  for (const literal of literals) {
    if (Node.isStringLiteral(literal) || Node.isNoSubstitutionTemplateLiteral(literal)) {
      literal.setLiteralValue(rewriteSpecifier(literal.getLiteralValue(), path, outputDirectory));
    }
  }
};

// The warnings about what a module brings into the Destination File, read
// before anything in it is rewritten.
const warnAbout = ({ path, sourceFile }: ScannedModule): Diagnostic[] => {
  const statements = sourceFile.getStatements();
  const nothingExported = exportsSomething(statements)
    ? []
    : [
        createDiagnostic({
          code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
          message: 'This file exports nothing, so the Destination File mirrors nothing from it.',
          file: path,
        }),
      ];
  const sideEffects = statements.filter(isSideEffecting).map((statement) =>
    createDiagnostic({
      code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
      message: `The top-level statement on line ${String(statement.getStartLineNumber())} is copied into the Destination File, so it now runs from two modules.`,
      file: path,
    }),
  );
  return [...nothingExported, ...sideEffects];
};

export type MirrorArgs = {
  /** The scanned files' absolute paths. */
  files: ReadonlyArray<string>;
  /** The directory each banner names its file relative to. */
  baseDirectory: string;
  /** The directory the Destination File lands in, which relative imports are rewritten against. */
  outputDirectory: string;
};

/** Builds the Destination File's text from the scanned files, and reports what blocks or degrades it. */
export const mirror = ({ files, baseDirectory, outputDirectory }: MirrorArgs): MirrorPayload => {
  const fromBase = (path: string): string => toPosix(relative(baseDirectory, path));
  const project = createProject();
  const scannedModules = readModules(project, files);
  const parseFailures = findParseFailures(project, scannedModules);
  if (parseFailures.length > 0) {
    return { diagnostics: parseFailures, content: '' };
  }
  const scanned = new Set(files);
  const blocking = findNamespaceImports(scannedModules, scanned);
  if (blocking.length > 0) {
    return { diagnostics: blocking, content: '' };
  }
  const cycles = findCycles(scannedModules);
  if (cycles.length > 0) {
    const diagnostics = cycles.map((cycle) =>
      createDiagnostic({
        code: DIAGNOSTIC_CODE.IMPORT_CYCLE,
        message: `These scanned files import each other, so one would read another's exports before they exist in the Destination File: ${cycle.map(fromBase).join(' → ')}. Break the cycle, or make an import type-only.`,
        file: cycle[0],
      }),
    );
    return { diagnostics, content: '' };
  }

  const modules = emissionOrder(scannedModules);
  const warnings = modules.flatMap(warnAbout);
  const contexts: ModuleContext[] = modules.map((module) =>
    readContext({ module, scanned, outputDirectory }),
  );
  const resolver = createOriginResolver({
    contexts: new Map(contexts.map((context) => [context.module.path, context])),
    scanned,
    outputDirectory,
  });

  // An import into the set resolves to a scanned module's declaration, or
  // through it to an import from outside, which then stands in for it.
  const collapsed: Array<{ binding: ImportBinding; origin: LocalOrigin }> = [];
  const externalImports: ImportBinding[] = [];
  for (const context of contexts) {
    for (const binding of context.imports) {
      const origin =
        binding.target === undefined ? undefined : resolver.resolveLocal(context, binding.local);
      if (origin?.kind === ORIGIN_KIND.LOCAL) {
        collapsed.push({ binding, origin });
      } else {
        externalImports.push(
          origin === undefined
            ? binding
            : {
                ...binding,
                specifier: origin.specifier,
                imported: origin.imported,
                target: undefined,
              },
        );
      }
    }
  }

  const exportPlan = planExports({ contexts, resolver, scanned, baseDirectory, outputDirectory });
  const finalNames = assignNames({ contexts, externalImports });
  for (const { binding, origin } of collapsed) {
    const name = finalNames.get(originKey(origin)) ?? origin.name;
    if (binding.local !== name) {
      binding.rename(name);
    }
  }

  const sections = contexts.map(({ module: { path, sourceFile } }) => {
    sourceFile.getImportDeclarations().forEach((declaration) => declaration.remove());
    rewriteExports({ sourceFile, plan: exportPlan, finalNames, outputDirectory });
    rewriteInlineSpecifiers(sourceFile, outputDirectory);
    const body = sourceFile.getFullText().trim();
    return `// ---- ${fromBase(path)} ----\n${body === '' ? '' : `${body}\n`}`;
  });
  const importBlock = renderImports({
    bindings: externalImports,
    bareImports: contexts.flatMap((context) => context.bareImports),
  });
  return {
    diagnostics: [...warnings, ...exportPlan.diagnostics],
    content: [
      `${GENERATED_HEADER}\n${importBlock === '' ? '' : `${importBlock}\n`}`,
      ...sections,
    ].join('\n'),
  };
};
