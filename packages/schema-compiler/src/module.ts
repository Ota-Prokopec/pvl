// One scanned file as the mirror sees it: its parsed source, where it lands
// in the Destination Directory, what the mirror asks of it, and compiling it
// into its mirrored file, module specifiers rewritten to reach the right files
// from there.
import * as path from 'node:path';
import { Node, SyntaxKind, type Project, type SourceFile, type StringLiteral } from 'ts-morph';
import { GENERATED_HEADER } from './consts.js';
import { SPECIFIER_TARGET_KIND } from './enums.js';
import type { Destination } from './destination/destination.js';
import type {
  MarkedToCompileSchemaSite,
  ScannedModuleCompiler,
} from './compilation/generate/scannedModuleCompiler.js';
import { Path } from './path.js';
import type { ScannedPath } from './scanner.js';
import { Specifier, type SpecifierTarget } from './compilation/mirror/specifier.js';
import { TsMorphProject } from './tsMorphProject.js';

/**
 * The absolute path of a scanned file's mirrored module. Branded so it can't
 * be mixed up with the scanned file's own path: `Module.readAll` is the only
 * place one is made.
 */
export type MirroredPath = string & { readonly __brand: 'MirroredPath' };

/** A scanned file's location, the project its module file is read into, and its mirrored location. */
export type ModuleOptions = {
  /** The file's location, relative to the Root Directory. */
  scannedPath: Required<Path>;
  /** The ts-morph project the file is read into. */
  tsMorphProject: Project;
  /** The absolute path of its mirrored module. */
  mirroredPath: MirroredPath;
};

/** One file the Destination Directory holds. */
export type MirroredFile = {
  /** Its path relative to the Destination Directory, with `/` separators. */
  relativePath: string;
  text: string;
};

export type CompileModuleArgs = {
  tsMorphProject: Project;
  /** The module's compiler, which read its `pvl.compile(...)` calls. */
  scannedModuleCompiler: ScannedModuleCompiler;
  /** The module's `pvl.compile(...)` calls that compile. */
  sites: ReadonlyArray<MarkedToCompileSchemaSite>;
  /** Lets an import of another scanned file point at that file's mirror instead. */
  mirroredPathByScannedPath: ReadonlyMap<ScannedPath, MirroredPath>;
};

export type RewriteSpecifiersArgs = {
  tsMorphProject: Project;
  /** Scanned file's absolute path → its mirrored module's absolute path. */
  mirroredPathByScannedPath: ReadonlyMap<string, MirroredPath>;
};

export type ReadAllModulesArgs = {
  tsMorphProject: Project;
  /** The scanned files' absolute paths. */
  scannedFilePaths: ReadonlyArray<ScannedPath>;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
  destination: Destination;
};

/**
 * One scanned file. Its `relative.path` is relative to the Root Directory,
 * which is also its path inside the Destination Directory.
 *
 * ```ts
 * const [user] = Module.readAll({ …, scannedFilePaths: ['/repo/src/schemas/user.ts'] });
 * user.relative.path // 'schemas/user.ts'
 * user.mirroredPath  // '/repo/.pvl/schemas/user.ts'
 * ```
 */
export class Module extends Path {
  /** The file's absolute path. */
  declare public readonly absolutePath: ScannedPath;
  /** Its path relative to the Root Directory. */
  declare public readonly relative: NonNullable<Path['relative']>;
  /** Its ts-morph source file, which the mirror reads and rewrites in place. */
  public readonly moduleFile: SourceFile;
  /** The absolute path of its mirrored module. */
  public readonly mirroredPath: MirroredPath;

  /**
   * A `Module` of the scanned file at `scannedPath`, read into
   * `tsMorphProject`; `Module.readAll` makes them.
   *
   * Throws ts-morph's error when the file can't be read from disk.
   */
  protected constructor({ scannedPath, tsMorphProject, mirroredPath }: ModuleOptions) {
    super(scannedPath.absolutePath, scannedPath.relative);
    this.moduleFile = tsMorphProject.addSourceFileAtPath(scannedPath.absolutePath);
    this.mirroredPath = mirroredPath;
  }

  /**
   * Adds each scanned file to `tsMorphProject` and places it in the mirror,
   * keeping the order of `scannedFilePaths`. A file outside the Root Directory
   * gets a `relative.path` starting with `..` (or an absolute one, on another
   * drive), which FILE_OUTSIDE_ROOT_DIR reports.
   *
   * With Root Directory `/repo/src` and Destination Directory `/repo/.pvl`:
   *
   * ```ts
   * Module.readAll({ …, scannedFilePaths: ['/repo/src/schemas/user.ts'] })
   * // [Module { absolutePath: '/repo/src/schemas/user.ts',
   * //    relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' },
   * //    moduleFile: <user.ts>, mirroredPath: '/repo/.pvl/schemas/user.ts' }]
   * ```
   *
   * Throws ts-morph's error when a path can't be read from disk.
   */
  public static readAll({
    tsMorphProject,
    scannedFilePaths,
    rootDirectory,
    destination,
  }: ReadAllModulesArgs): Module[] {
    return scannedFilePaths.map((scannedFilePath) => {
      const scannedPath = Path.create(scannedFilePath, rootDirectory);
      return new Module({
        scannedPath,
        tsMorphProject,
        mirroredPath: path.join(
          destination.absolutePath,
          scannedPath.relative.path,
        ) as MirroredPath,
      });
    });
  }

  /**
   * Whether the module's `relative.path`, relative to the Root Directory,
   * leads outside it, so the module has no place in the mirror.
   *
   * ```ts
   * // relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' }
   * module.isOutsideRootDirectory() // false
   * // relative: { absoluteBase: '/repo/src', path: '../lib/user.ts' }
   * module.isOutsideRootDirectory() // true
   * ```
   */
  public isOutsideRootDirectory(): boolean {
    const relativePath = this.relative.path;
    return relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath);
  }

  /**
   * Turns the module into its mirrored file by editing its source file in
   * place: replaces its `pvl.compile(...)` calls with straight-line code,
   * points its module specifiers at the right files from the mirrored
   * location, then prepends the `@generated` header.
   *
   * ```ts
   * // /repo/src/schemas/user.ts, mirrored to /repo/.pvl/schemas/user.ts
   * import { pvl } from '@pvl/schema';
   * import { tags } from '../lib/tags.js';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
   * // module.compile({ … })
   * // → { relativePath: 'schemas/user.ts', text: '<@generated header>\n…' }, where
   * //   '../lib/tags.js' becomes '../../src/lib/tags.js' and `pvl.compile(...)`
   * //   becomes an instance of its emitted Compiled Schema class
   * ```
   */
  public compile({
    tsMorphProject,
    scannedModuleCompiler,
    sites,
    mirroredPathByScannedPath,
  }: CompileModuleArgs): MirroredFile {
    scannedModuleCompiler.applyCompiledSchemas(sites);

    this.rewriteSpecifiers({ tsMorphProject, mirroredPathByScannedPath });

    return {
      relativePath: this.relative.path,
      text: `${GENERATED_HEADER}\n${this.moduleFile.getFullText()}`,
    };
  }

  /**
   * Whether any of the module's top-level statements exports a name, in any
   * form:
   *
   * ```ts
   * export const user = …;        export { user };
   * export * from './user.js';    export type User = …;
   * ```
   *
   * A file of only `const internal = 1;` exports nothing.
   */
  public hasExport(): boolean {
    return this.moduleFile
      .getStatements()
      .some(
        (statement) =>
          Node.isExportDeclaration(statement) ||
          Node.isExportAssignment(statement) ||
          (Node.isExportable(statement) && statement.hasExportKeyword()),
      );
  }

  /**
   * Rewrites, in place, every module specifier in the module's source file so
   * it reaches the right file from the module's mirrored location: a scanned
   * file through its mirrored module, anything else through the original
   * file, and a package as before. Import and export declarations, a dynamic
   * `import()`, an `import x = require()` and an `import('…')` type are all
   * covered; a computed `import()` is left alone.
   *
   * In /repo/src/schemas/order.ts, mirrored to /repo/.pvl/schemas/order.ts,
   * with user.ts scanned and helpers.ts not:
   *
   * ```ts
   * import { pvl } from '@pvl/schema';             // kept: a package
   * import { user } from './user.js';              // kept: the mirror has the same layout
   * import { user as u } from '@/schemas/user';    // → './user'
   * import { trim } from '../lib/helpers.js';      // → '../../src/lib/helpers.js'
   * const heavy = () => import('../lib/heavy.js'); // → '../../src/lib/heavy.js'
   * ```
   */
  private rewriteSpecifiers({
    tsMorphProject,
    mirroredPathByScannedPath,
  }: RewriteSpecifiersArgs): void {
    const outputDirectory = Path.create(path.dirname(this.mirroredPath));

    for (const literal of Module.findSpecifierLiterals(this.moduleFile)) {
      const moduleSpecifier = literal.getLiteralValue();
      const specifier = new Specifier(
        moduleSpecifier,
        this.resolveSpecifierTarget({
          specifier: new Specifier(moduleSpecifier),
          tsMorphProject,
          mirroredPathByScannedPath,
        }),
      );
      const rewritten = specifier.rewrite({ importerPath: this, outputDirectory }).value;

      if (rewritten !== moduleSpecifier) {
        literal.setLiteralValue(rewritten);
      }
    }
  }

  /**
   * What `specifier` reaches, resolved from the module's original location,
   * where it was written, not from its mirrored one: a scanned file's
   * mirrored module, an unscanned file of the repository, or nothing the
   * mirror rewrites toward (a package, or no file at all).
   */
  private resolveSpecifierTarget({
    specifier,
    tsMorphProject,
    mirroredPathByScannedPath,
  }: RewriteSpecifiersArgs & { specifier: Specifier }): SpecifierTarget {
    const moduleFile = TsMorphProject.resolveModuleFile(
      tsMorphProject,
      specifier,
      this.absolutePath,
    );
    if (moduleFile === undefined || moduleFile.isPackage) {
      return { kind: SPECIFIER_TARGET_KIND.UNRESOLVED };
    }

    const mirroredPath = mirroredPathByScannedPath.get(moduleFile.absolutePath);
    return mirroredPath === undefined
      ? { kind: SPECIFIER_TARGET_KIND.REPOSITORY, path: moduleFile }
      : { kind: SPECIFIER_TARGET_KIND.MIRRORED, path: Path.create(mirroredPath) };
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
  private static findSpecifierLiterals(sourceFile: SourceFile): StringLiteral[] {
    const declarationModuleSpecifiers = [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ].flatMap((declaration) => declaration.getModuleSpecifier() ?? []);

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
