// Prints the Destination File: the generated header, the import block, then
// each module under a banner naming its source file, with what still points
// outside it rewritten to resolve from the destination.
import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { GENERATED_HEADER } from '../consts.js';
import type { ImportBinding, ModuleContext } from './context.js';
import { rewriteExports, type PlanExportsPayload } from './exports.js';
import { renderImportBlock } from './imports.js';
import { toDisplayPath, rewriteSpecifierForOutputDirectory } from './utils.js';

// Rewrites the specifiers that stay in a module's body, a dynamic `import()`
// and an `import x = require()`, to resolve from the destination.
const rewriteDynamicImportAndRequireSpecifiers = (
  sourceFile: SourceFile,
  outputDirectory: string,
): void => {
  const modulePath = sourceFile.getFilePath();
  const specifierLiterals = [
    ...sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
      .map((call) => call.getArguments()[0]),
    ...sourceFile.getStatements().flatMap((statement) => {
      const moduleReference = Node.isImportEqualsDeclaration(statement)
        ? statement.getModuleReference()
        : undefined;
      return Node.isExternalModuleReference(moduleReference)
        ? [moduleReference.getExpression()]
        : [];
    }),
  ];
  for (const specifierLiteral of specifierLiterals) {
    if (
      Node.isStringLiteral(specifierLiteral) ||
      Node.isNoSubstitutionTemplateLiteral(specifierLiteral)
    ) {
      specifierLiteral.setLiteralValue(
        rewriteSpecifierForOutputDirectory(
          specifierLiteral.getLiteralValue(),
          modulePath,
          outputDirectory,
        ),
      );
    }
  }
};

export type RenderDestinationFileArgs = {
  /** In emission order. */
  moduleContexts: ReadonlyArray<ModuleContext>;
  exportPlan: PlanExportsPayload;
  /** Origin key → the name a non-exported declaration ended up with. */
  finalNameByOriginKey: ReadonlyMap<string, string>;
  externalImports: ReadonlyArray<ImportBinding>;
  baseDirectory: string;
  outputDirectory: string;
};

/** The Destination File's text. Rewrites each module's source file as it goes. */
export const renderDestinationFile = ({
  moduleContexts,
  exportPlan,
  finalNameByOriginKey,
  externalImports,
  baseDirectory,
  outputDirectory,
}: RenderDestinationFileArgs): string => {
  const moduleSections = moduleContexts.map(
    ({ scannedModule: { path: modulePath, sourceFile } }) => {
      sourceFile.getImportDeclarations().forEach((declaration) => declaration.remove());
      rewriteExports({ sourceFile, exportPlan: exportPlan, finalNameByOriginKey, outputDirectory });
      rewriteDynamicImportAndRequireSpecifiers(sourceFile, outputDirectory);
      const moduleBody = sourceFile.getFullText().trim();
      return `// ---- ${toDisplayPath(baseDirectory, modulePath)} ----\n${moduleBody === '' ? '' : `${moduleBody}\n`}`;
    },
  );
  const importBlockText = renderImportBlock({
    externalImports: externalImports,
    sideEffectImportSpecifiers: moduleContexts.flatMap(
      (context) => context.sideEffectImportSpecifiers,
    ),
  });
  return [
    `${GENERATED_HEADER}\n${importBlockText === '' ? '' : `${importBlockText}\n`}`,
    ...moduleSections,
  ].join('\n');
};
