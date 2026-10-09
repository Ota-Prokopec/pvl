// The module specifiers of one scanned module: finding them, and rewriting
// them so each one reaches the right file from the Destination Directory:
// the mirrored module for a scanned file, the original file for anything else.
import * as path from 'node:path';
import { Node, SyntaxKind, type Project, type SourceFile, type StringLiteral } from 'ts-morph';
import type { MirroredPath, ScannedModule } from './scannedModule.js';
import { TsMorphProject } from './tsMorphProject.js';
import {
  isPathModuleSpecifier,
  isRelativeModuleSpecifier,
  rewritePathModuleSpecifier,
  toRelativeModuleSpecifier,
} from './utils.js';

/** The scanned module whose module specifiers a ModuleSpecifier handles, and the mirror they point into. */
export type ModuleSpecifierOptions = {
  tsMorphProject: Project;
  /** The module whose module specifiers are handled, edited in place. */
  scannedModule: ScannedModule;
  /** Scanned file's absolute path → its mirrored module's absolute path. */
  mirroredPathByScannedPath: ReadonlyMap<string, MirroredPath>;
};

/**
 * Everything the compiler does with the module specifiers of one scanned
 * module, such as rewriting each so it reaches the right file from the
 * module's mirrored location.
 *
 * ```ts
 * new ModuleSpecifier({ tsMorphProject, scannedModule, mirroredPathByScannedPath }).rewriteModuleSpecifiers();
 * ```
 */
export class ModuleSpecifier {
  private readonly tsMorphProject: Project;
  private readonly scannedModule: ScannedModule;
  private readonly mirroredPathByScannedPath: ReadonlyMap<string, MirroredPath>;

  public constructor({
    tsMorphProject,
    scannedModule,
    mirroredPathByScannedPath,
  }: ModuleSpecifierOptions) {
    this.tsMorphProject = tsMorphProject;
    this.scannedModule = scannedModule;
    this.mirroredPathByScannedPath = mirroredPathByScannedPath;
  }

  /**
   * Rewrites, in place, every module specifier in the scanned module's source
   * file so it reaches the right file from the module's mirrored location:
   * a scanned file through its mirrored module, anything else through the
   * original file, and a package as before. Import and export declarations, a
   * dynamic `import()`, an `import x = require()` and an `import('…')` type
   * are all covered; a computed `import()` is left alone.
   *
   * In /repo/src/schemas/order.ts, mirrored to /repo/.pvl/schemas/order.ts,
   * with user.ts scanned and helpers.ts not:
   *
   * ```ts
   * import { pvl } from '@pvl/schema';          // kept: a package
   * import { user } from './user.js';           // kept: the mirror has the same layout
   * import { user as u } from '@/schemas/user'; // → './user'
   * import { trim } from '../lib/helpers.js';   // → '../../src/lib/helpers.js'
   * const heavy = () => import('../lib/heavy.js'); // → '../../src/lib/heavy.js'
   * ```
   */
  public rewriteModuleSpecifiers(): void {
    for (const moduleSpecifierLiteral of ModuleSpecifier.findModuleSpecifierLiterals(
      this.scannedModule.sourceFile,
    )) {
      const moduleSpecifier = moduleSpecifierLiteral.getLiteralValue();

      const rewrittenModuleSpecifier = this.rewriteModuleSpecifier(moduleSpecifier);

      if (rewrittenModuleSpecifier !== moduleSpecifier) {
        moduleSpecifierLiteral.setLiteralValue(rewrittenModuleSpecifier);
      }
    }
  }

  /**
   * `moduleSpecifier`, written in the scanned module, spelled so it reaches
   * the right file from the module's mirrored location: the mirrored module
   * for a scanned file, the original file for anything else.
   *
   * In /repo/src/schemas/order.ts, mirrored to /repo/.pvl/schemas/order.ts,
   * with user.ts scanned and tsconfig `paths` mapping `@/*` to `./src/*`:
   *
   * ```ts
   * this.rewriteModuleSpecifier('./user.js')         // './user.js': the mirror has the same layout
   * this.rewriteModuleSpecifier('../lib/helpers.js') // '../../src/lib/helpers.js': back to the original
   * this.rewriteModuleSpecifier('@/schemas/user.js') // './user.js': the alias reaches a scanned file
   * this.rewriteModuleSpecifier('@/lib/helpers')     // '../../src/lib/helpers': the alias reaches an unscanned file
   * this.rewriteModuleSpecifier('@pvl/schema')       // '@pvl/schema': a package, kept
   * this.rewriteModuleSpecifier('@/lib/missing')     // '@/lib/missing': resolves to nothing, kept
   * ```
   */
  private rewriteModuleSpecifier(moduleSpecifier: string): string {
    // Resolved from the scanned module's original location, where the module
    // specifier was written, not from its mirrored one.
    const resolvedModuleFile = TsMorphProject.resolveModuleFile(
      this.tsMorphProject,
      moduleSpecifier,
      this.scannedModule.path,
    );

    // The application's own file the module specifier reaches. A package, or a
    // module specifier that resolves to nothing, has none.
    const localFilePath =
      resolvedModuleFile === undefined || resolvedModuleFile.isPackage
        ? undefined
        : resolvedModuleFile.path;

    // When that file was scanned too, its mirrored module, which the mirrored
    // module should import instead of the original.
    const mirroredTargetPath: MirroredPath | undefined =
      localFilePath === undefined ? undefined : this.mirroredPathByScannedPath.get(localFilePath);

    // Where the rewritten module specifier is read from.
    const outputDirectory = path.dirname(this.scannedModule.mirroredPath);

    // A relative path to a scanned file already reaches its mirrored module:
    // the mirror reproduces the Root Directory's layout, so both ends moved
    // together.
    if (mirroredTargetPath !== undefined && isRelativeModuleSpecifier(moduleSpecifier)) {
      return moduleSpecifier;
    }
    // A path to an unscanned file points back to the original file. It is
    // rewritten from the path as written rather than from the resolved file,
    // so it keeps its spelling, and one that resolves to nothing still points
    // where it did.
    if (mirroredTargetPath === undefined && isPathModuleSpecifier(moduleSpecifier)) {
      return rewritePathModuleSpecifier(moduleSpecifier, this.scannedModule.path, outputDirectory);
    }

    // A package, or an alias that resolves to nothing, reads the same from
    // anywhere, so it is kept as written.
    if (localFilePath === undefined) {
      return moduleSpecifier;
    }

    // What's left is an alias that resolves to a file, or an absolute path to a
    // scanned file. Both name the original location, so each becomes a relative
    // path to the mirrored module, or to the original file when that wasn't
    // scanned. The original's extension spelling is kept.
    // It is needed when the absolute path of the alias aims to a scanned file (if it does not, this step is useless)
    return toRelativeModuleSpecifier(
      outputDirectory,
      mirroredTargetPath ?? localFilePath,
      moduleSpecifier,
    );
  }

  /**
   * Every string literal in `sourceFile` that names a module, in any form a
   * module can be named in, each as written.
   *
   * ```ts
   * import { user } from './user.js';                 // './user.js'
   * import './setup.js';                              // './setup.js'
   * export { trim } from '../lib/helpers.js';         // '../lib/helpers.js'
   * const heavy = () => import('./heavy.js');         // './heavy.js'
   * import fs = require('../lib/fs.js');              // '../lib/fs.js'
   * type Options = import('../lib/types.js').Options; // '../lib/types.js'
   * import(`./locales/${lang}.js`);                   // left out: computed, not a literal
   * export { user };                                  // left out: names no module
   * ```
   */
  private static findModuleSpecifierLiterals(sourceFile: SourceFile): StringLiteral[] {
    const declarationModuleSpecifiers = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ].flatMap((declaration) => {
      const moduleSpecifier = declaration.getModuleSpecifier();
      return moduleSpecifier === undefined ? [] : [moduleSpecifier];
    });

    const dynamicImportModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
      .flatMap((call) => call.getArguments().slice(0, 1))
      .filter((argument) => Node.isStringLiteral(argument));

    const requireModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.ExternalModuleReference)
      .map((moduleReference) => moduleReference.getExpression())
      .filter((expression) => Node.isStringLiteral(expression));

    const importTypeModuleSpecifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.ImportType)
      .map((importType) => importType.getArgument())
      .flatMap((argument) => (Node.isLiteralTypeNode(argument) ? [argument.getLiteral()] : []))
      .filter((literal) => Node.isStringLiteral(literal));

    return [
      ...declarationModuleSpecifiers,
      ...dynamicImportModuleSpecifiers,
      ...requireModuleSpecifiers,
      ...importTypeModuleSpecifiers,
    ];
  }
}
