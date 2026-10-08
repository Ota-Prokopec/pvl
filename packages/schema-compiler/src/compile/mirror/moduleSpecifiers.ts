// Rewrites the module specifiers in a mirrored module so each one reaches
// the right file from the Destination Directory: the mirrored module for a
// scanned file, the original file for anything else.
import { dirname } from 'node:path';
import { Node, SyntaxKind, type Project, type SourceFile, type StringLiteral } from 'ts-morph';
import type { ScannedModule } from './scannedModule.js';
import { TsMorphProject } from './tsMorphProject.js';
import {
  isPathModuleSpecifier,
  isRelativeModuleSpecifier,
  rewritePathModuleSpecifier,
  toRelativeModuleSpecifier,
} from './utils.js';

// Every string literal in `sourceFile` that names a module, in any form a
// module can be named in, each as written:
//
//   import { user } from './user.js';             // './user.js'
//   export { trim } from '../lib/helpers.js';     // '../lib/helpers.js'
//   const heavy = () => import('./heavy.js');     // './heavy.js'
//   import fs = require('../lib/fs.js');          // '../lib/fs.js'
//   type Options = import('../lib/types.js').Options; // '../lib/types.js'
//
// A computed one (import(`./locales/${lang}.js`)) isn't a literal, so it is
// left out, as is `export { user }`, which names no module.
const findModuleSpecifierLiterals = (sourceFile: SourceFile): StringLiteral[] => {
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
};

type RewriteModuleSpecifierArgs = {
  tsMorphProject: Project;
  scannedModule: ScannedModule;
  /** Scanned file's absolute path → its mirrored module's absolute path. */
  mirroredPathByScannedPath: ReadonlyMap<string, string>;
  /** As written in the scanned module. */
  moduleSpecifier: string;
};

// `moduleSpecifier`, written in the scanned module, spelled so it reaches
// the right file from the module's mirrored location. In
// /repo/src/schemas/order.ts, mirrored to /repo/.pvl/schemas/order.ts, with
// user.ts scanned and tsconfig `paths` mapping `@/*` to `./src/*`:
//
//   './user.js'         // kept: the mirror has the same layout
//   '../lib/helpers.js' // '../../src/lib/helpers.js': back to the original
//   '@/schemas/user.js' // './user.js': the alias reaches a scanned file
//   '@/lib/helpers'     // '../../src/lib/helpers': the alias reaches an unscanned file
//   '@pvl/schema'       // kept: a package
//   'not-installed'     // kept: resolves to nothing
const rewriteModuleSpecifier = ({
  tsMorphProject,
  scannedModule,
  mirroredPathByScannedPath,
  moduleSpecifier,
}: RewriteModuleSpecifierArgs): string => {
  const resolvedModuleFile = TsMorphProject.resolveModuleFile(
    tsMorphProject,
    moduleSpecifier,
    scannedModule.path,
  );
  const localFilePath =
    resolvedModuleFile === undefined || resolvedModuleFile.isPackage
      ? undefined
      : resolvedModuleFile.path;
  const mirroredTargetPath =
    localFilePath === undefined ? undefined : mirroredPathByScannedPath.get(localFilePath);
  const outputDirectory = dirname(scannedModule.mirroredPath);

  if (mirroredTargetPath !== undefined && isRelativeModuleSpecifier(moduleSpecifier)) {
    return moduleSpecifier;
  }
  if (mirroredTargetPath === undefined && isPathModuleSpecifier(moduleSpecifier)) {
    return rewritePathModuleSpecifier(moduleSpecifier, scannedModule.path, outputDirectory);
  }
  if (localFilePath === undefined) {
    return moduleSpecifier;
  }
  return toRelativeModuleSpecifier(
    outputDirectory,
    mirroredTargetPath ?? localFilePath,
    moduleSpecifier,
  );
};

export type RewriteModuleSpecifiersArgs = Omit<RewriteModuleSpecifierArgs, 'moduleSpecifier'>;

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
export const rewriteModuleSpecifiers = (args: RewriteModuleSpecifiersArgs): void => {
  for (const moduleSpecifierLiteral of findModuleSpecifierLiterals(args.scannedModule.sourceFile)) {
    const moduleSpecifier = moduleSpecifierLiteral.getLiteralValue();
    const rewrittenModuleSpecifier = rewriteModuleSpecifier({ ...args, moduleSpecifier });
    if (rewrittenModuleSpecifier !== moduleSpecifier) {
      moduleSpecifierLiteral.setLiteralValue(rewrittenModuleSpecifier);
    }
  }
};
