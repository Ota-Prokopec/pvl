// Prints the Destination File: the generated header, the import block, then
// each module under a banner naming its source file, with what still points
// outside it rewritten to resolve from the destination.
import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { GENERATED_HEADER } from '../consts.js';
import type { ImportBinding, ModuleContext } from './context.js';
import { rewriteExports, type PlanExportsPayload } from './exports.js';
import { renderImports } from './imports.js';
import { displayPath, rewriteSpecifier } from './utils.js';

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

export type RenderDestinationFileArgs = {
  /** In emission order. */
  contexts: ReadonlyArray<ModuleContext>;
  exportPlan: PlanExportsPayload;
  /** Origin key → the name a non-exported declaration ended up with. */
  finalNames: ReadonlyMap<string, string>;
  externalImports: ReadonlyArray<ImportBinding>;
  baseDirectory: string;
  outputDirectory: string;
};

/** The Destination File's text. Rewrites each module's source file as it goes. */
export const renderDestinationFile = ({
  contexts,
  exportPlan,
  finalNames,
  externalImports,
  baseDirectory,
  outputDirectory,
}: RenderDestinationFileArgs): string => {
  const sections = contexts.map(({ module: { path, sourceFile } }) => {
    sourceFile.getImportDeclarations().forEach((declaration) => declaration.remove());
    rewriteExports({ sourceFile, plan: exportPlan, finalNames, outputDirectory });
    rewriteInlineSpecifiers(sourceFile, outputDirectory);
    const body = sourceFile.getFullText().trim();
    return `// ---- ${displayPath(baseDirectory, path)} ----\n${body === '' ? '' : `${body}\n`}`;
  });
  const importBlock = renderImports({
    bindings: externalImports,
    bareImports: contexts.flatMap((context) => context.bareImports),
  });
  return [`${GENERATED_HEADER}\n${importBlock === '' ? '' : `${importBlock}\n`}`, ...sections].join(
    '\n',
  );
};
