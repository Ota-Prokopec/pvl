// Creates a text for the **Destination** File: the generated header, the import block, then
// each module under a banner naming its source file, with what still points
// outside it rewritten to resolve from the destination.
import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { GENERATED_HEADER } from '../consts.js';
import type { ImportBinding, ModuleContext } from './moduleContextReader.js';
import { rewriteExports, type PlanExportsPayload } from './exports.js';
import { renderImportBlock } from './imports.js';
import { toDisplayPath, rewriteModuleSpecifierForOutputDirectory } from './utils.js';

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

/**
 * Prints the Destination File: turns the scanned modules, once the mirror has
 * analysed them, into the one text `pvl compile` writes. It is the mirror's
 * last step; the analysis (what each module imports and exports, which names
 * collide, which exports to rewrite) is done by then and arrives as input.
 *
 * Public method:
 *
 * - `render(args)`
 *   - **Input**, a `RenderDestinationFileArgs`:
 *     - `moduleContexts`: the scanned modules in emission order, each with
 *       its ts-morph source file and the side-effect imports it carries.
 *     - `exportPlan`: which export declarations to rewrite, and into what.
 *     - `finalNameByOriginKey`: the names declarations ended up with after
 *       collisions were resolved.
 *     - `externalImports`: the imports from outside the scanned set.
 *     - `baseDirectory`: the directory the banners' paths are relative to.
 *     - `outputDirectory`: the directory the Destination File is written in.
 *   - **Output**: the file's text, ending in a newline. It has the
 *     `@generated` header, the import block (left out when there is nothing to
 *     import), then a `// ---- <path> ----` banner per module, followed by the
 *     module's code (just the banner when the module is empty). No modules
 *     gives the header alone.
 *   - **Reports nothing**: it raises no diagnostics and doesn't write to
 *     disk. Whatever can go wrong with the code was reported earlier, and the
 *     caller writes the text.
 *   - **Side effect**: it edits the modules' ts-morph source files in place,
 *     so call it once, last.
 */
export class DestinationFileRenderer {
  // Points the module specifiers inside a module's body, which the import
  // block doesn't collect, at the output directory, so they reach the same file
  // from the Destination File: the string of a dynamic `import()` and the
  // `require` of an `import … = require(…)`.
  //
  // In `/repo/src/schemas/user.ts`, with output directory `/repo/src/generated`:
  //
  //   import('./heavy.js');                     // → '../schemas/heavy.js'
  //   import fs = require('../fs-helpers.js');  // → '../fs-helpers.js'
  //   import('some-package');                   // kept: a package
  //   import(`./locales/${lang}.js`);           // kept: computed, can't be rewritten
  private static rewriteDynamicImportAndRequireModuleSpecifiers(
    sourceFile: SourceFile,
    outputDirectory: string,
  ): void {
    const modulePath = sourceFile.getFilePath();

    const importExpressionModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
      .flatMap((call) => call.getArguments().slice(0, 1));

    const requireExpressionModuleSpecifiers = sourceFile.getStatements().flatMap((statement) => {
      const moduleReference = Node.isImportEqualsDeclaration(statement)
        ? statement.getModuleReference()
        : undefined;
      return Node.isExternalModuleReference(moduleReference)
        ? [moduleReference.getExpression()]
        : [];
    });

    for (const moduleSpecifier of [
      ...importExpressionModuleSpecifiers,
      ...requireExpressionModuleSpecifiers,
    ]) {
      if (
        Node.isStringLiteral(moduleSpecifier) ||
        Node.isNoSubstitutionTemplateLiteral(moduleSpecifier)
      ) {
        moduleSpecifier.setLiteralValue(
          rewriteModuleSpecifierForOutputDirectory(
            moduleSpecifier.getLiteralValue(),
            modulePath,
            outputDirectory,
          ),
        );
      }
    }
  }

  /**
   * The Destination File's text: the `@generated` header, one import block for
   * everything the modules import from outside the scanned set, then each
   * module in emission order under a banner naming its source file. Imports
   * between scanned modules disappear, since the modules now share the file;
   * the rest of each module's code is kept as written.
   *
   * ```ts
   * // src/schemas/user.ts
   * import { pvl } from '@pvl/schema';
   * export const user = pvl.object({ … });
   *
   * // src/schemas/post.ts
   * import { pvl } from '@pvl/schema';
   * import { user } from './user.js';          // removed: `user` is now in the same file
   * export const post = pvl.object({ author: user });
   * export { user } from './user.js';          // dropped: `user` is already exported
   * const load = () => import('./heavy.js');   // → import('../schemas/heavy.js')
   *
   * // → the Destination File, in `src/generated/`
   * // @generated by @pvl/schema-compiler. Do not edit: run `pvl compile` to regenerate.
   * import { pvl } from '@pvl/schema';         // once, for both modules
   *
   * // ---- src/schemas/user.ts ----
   * export const user = pvl.object({ … });
   *
   * // ---- src/schemas/post.ts ----
   * export const post = pvl.object({ author: user });
   * const load = () => import('../schemas/heavy.js');
   * ```
   *
   * A dynamic `import()` of a scanned module is not inlined: it keeps loading
   * that module's source file.
   *
   * Edits the modules' source files in place, so it runs once, last.
   */
  public static render({
    moduleContexts,
    exportPlan,
    finalNameByOriginKey,
    externalImports,
    baseDirectory,
    outputDirectory,
  }: RenderDestinationFileArgs): string {
    const moduleSections = moduleContexts.map((moduleContext) => {
      const {
        scannedModule: { path: modulePath, sourceFile },
      } = moduleContext;

      // Every module shares the Destination File's one scope, so its imports
      // can't stay: the same `pvl` imported by two modules would be declared
      // twice, and an import of a scanned module would point at a file whose
      // code is already here. What they carried is rendered once in the
      // import block (`externalImports`, `sideEffectModuleSpecifiers`).
      // The imports are not lost - they are already captured in `moduleContexts`
      sourceFile.getImportDeclarations().forEach((declaration) => declaration.remove());

      rewriteExports({ sourceFile, exportPlan: exportPlan, finalNameByOriginKey, outputDirectory });
      DestinationFileRenderer.rewriteDynamicImportAndRequireModuleSpecifiers(
        sourceFile,
        outputDirectory,
      );
      const moduleBody = sourceFile.getFullText().trim();
      return `// ---- ${toDisplayPath(baseDirectory, modulePath)} ----\n${moduleBody === '' ? '' : `${moduleBody}\n`}`;
    });

    const importBlockText = renderImportBlock({
      externalImports: externalImports,
      sideEffectModuleSpecifiers: moduleContexts.flatMap(
        (context) => context.sideEffectModuleSpecifiers,
      ),
    });

    return [
      `${GENERATED_HEADER}\n${importBlockText === '' ? '' : `${importBlockText}\n`}`,
      ...moduleSections,
    ].join('\n');
  }
}
