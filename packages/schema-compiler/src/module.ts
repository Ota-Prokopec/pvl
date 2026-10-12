// One scanned file as the mirror sees it: its parsed source, where it lands
// in the Destination Directory, what the mirror asks of it, its precheck, and
// compiling it into its mirrored file, module specifiers rewritten to reach
// the right files from there.
import * as path from 'node:path';
import { Node, SyntaxKind, type Project, type SourceFile, type StringLiteral } from 'ts-morph';
import { PvlAst } from './ast/pvlAst.js';
import { COMPILED_SCHEMA_IMPORT, GENERATED_HEADER } from './consts.js';
import { DIAGNOSTIC_CODE, SPECIFIER_TARGET_KIND } from './enums.js';
import type { Destination } from './destination/destination.js';
import { Diagnostic } from './diagnostics/diagnostic.js';
import { Path } from './path.js';
import { Precheck, type ModuleCompilation } from './precheck.js';
import { Schema } from './schemas/schema.js';
// Registers every Schema subclass, which `Schema.read` picks one from.
import './schemas/index.js';
import type { ScannedPath } from './scanner.js';
import { Specifier, type SpecifierTarget } from './specifier.js';
import { TsMorphProject } from './tsMorphProject.js';

/**
 * The absolute path of a scanned file's mirrored module. Branded so it can't
 * be mixed up with the scanned file's own path: the `Module` constructor is
 * the only place one is made.
 */
export type MirroredPath = string & { readonly __brand: 'MirroredPath' };

/** A scanned file, the project it is read into, and the directories that place it in the mirror. */
export type ModuleOptions = {
  /** The scanned file's absolute path. */
  scannedFilePath: ScannedPath;
  /** The ts-morph project the file is read into. */
  tsMorphProject: Project;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
  destination: Destination;
};

/** One file the Destination Directory holds. */
export type MirroredFile = {
  /** Its path relative to the Destination Directory, with `/` separators. */
  relativePath: string;
  text: string;
};

export type CompileModuleArgs = {
  tsMorphProject: Project;
  /** The module's Marked-to-Compile Schemas that compile. */
  schemas: ReadonlyArray<Schema>;
  /** Lets an import of another scanned file point at that file's mirror instead. */
  mirroredPathByScannedPath: ReadonlyMap<ScannedPath, MirroredPath>;
};

export type RewriteSpecifiersArgs = {
  tsMorphProject: Project;
  /** Scanned file's absolute path → its mirrored module's absolute path. */
  mirroredPathByScannedPath: ReadonlyMap<string, MirroredPath>;
};

export type PrecheckModulePayload = {
  diagnostics: Diagnostic[];
  /** Its compilation, or `undefined` when it doesn't parse. */
  compilation: ModuleCompilation | undefined;
};

/**
 * One scanned file. Its `path.relative.path` is relative to the Root Directory,
 * which is also its path inside the Destination Directory.
 *
 * ```ts
 * const user = new Module({ …, scannedFilePath: '/repo/src/schemas/user.ts' });
 * user.path.relative.path // 'schemas/user.ts'
 * user.mirroredPath       // '/repo/.pvl/schemas/user.ts'
 * ```
 */
export class Module {
  /** Where the scanned file is: its absolute path, and its path relative to the Root Directory. */
  public readonly path: Required<Path> & { readonly absolutePath: ScannedPath };

  /** Its ts-morph source file, which the mirror reads and rewrites in place. */
  public readonly moduleFile: SourceFile;
  /** The absolute path of its mirrored module. */
  public readonly mirroredPath: MirroredPath;

  /**
   * The scanned file at `scannedFilePath`, read into `tsMorphProject` and
   * placed in the mirror. A file outside the Root Directory gets a
   * `path.relative.path` starting with `..` (or an absolute one, on another
   * drive), which FILE_OUTSIDE_ROOT_DIR reports.
   *
   * With Root Directory `/repo/src` and Destination Directory `/repo/.pvl`:
   *
   * ```ts
   * new Module({ …, scannedFilePath: '/repo/src/schemas/user.ts' })
   * // Module { path: { absolutePath: '/repo/src/schemas/user.ts',
   * //     relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' } },
   * //   moduleFile: <user.ts>, mirroredPath: '/repo/.pvl/schemas/user.ts' }
   * ```
   *
   * Throws ts-morph's error when the file can't be read from disk.
   */
  public constructor({
    scannedFilePath,
    tsMorphProject,
    rootDirectory,
    destination,
  }: ModuleOptions) {
    this.path = Path.create(scannedFilePath, rootDirectory) as Module['path'];
    this.moduleFile = tsMorphProject.addSourceFileAtPath(scannedFilePath);
    this.mirroredPath = path.join(
      destination.absolutePath,
      this.path.relative.path,
    ) as MirroredPath;
  }

  /**
   * Whether the module's `path.relative.path`, relative to the Root Directory,
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
    const relativePath = this.path.relative.path;
    return relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath);
  }

  /**
   * Every error and warning the module raises on its own, found before its
   * source file is rewritten, with its compilation when it parses. A clash
   * with another module's exports (DUPLICATE_EXPORT) needs every module, so
   * `Precheck.run` checks it.
   *
   * A module with syntax errors gets PARSE_FAILED, and FILE_OUTSIDE_ROOT_DIR
   * when it applies, and has no compilation: the tree TypeScript recovers
   * from broken code holds statements nobody wrote, so every later check
   * needs the module to parse.
   *
   * - PARSE_FAILED: the file isn't valid syntax.
   * - FILE_OUTSIDE_ROOT_DIR: the file isn't under the Root Directory.
   * - DEFAULT_EXPORT: the file has a default export.
   * - FILE_EXPORTS_NOTHING, SIDE_EFFECT_COPIED: warnings.
   * - COMPILE_ARGUMENT_UNRESOLVABLE, COMPILE_ARGUMENT_NOT_COMPOSITE,
   *   COMPILE_RESULT_MODIFIED, UNSUPPORTED_SCHEMA: a `pvl.compile(...)` call
   *   can't be compiled (see findMarkedToCompileSchemas).
   *
   * ```ts
   * // /repo/src/schemas/user.ts
   * export default pvl.compile(pvl.object({ name: pvl.string() }));
   * user.precheck()
   * // { diagnostics: [DEFAULT_EXPORT], compilation: { module: user, schemas: [<1 Schema>], … } }
   *
   * // /repo/src/schemas/broken.ts
   * export const user = pvl.object({ name: pvl.string() ;
   * broken.precheck()
   * // { diagnostics: [PARSE_FAILED], compilation: undefined }
   * ```
   */
  public precheck(): PrecheckModulePayload {
    const parseFailureDiagnostics = Precheck.findParseFailuresDiagnostics(
      this.moduleFile.getProject(),
      [this],
    );
    const outsideRootDirectoryDiagnostics = Precheck.findFilesOutsideRootDirectoryDiagnostics(
      [this],
      this.path.relative.absoluteBase,
    );
    if (parseFailureDiagnostics.length > 0) {
      return {
        diagnostics: [...parseFailureDiagnostics, ...outsideRootDirectoryDiagnostics],
        compilation: undefined,
      };
    }

    const compilation: ModuleCompilation = {
      module: this,
      ...this.findMarkedToCompileSchemas(),
    };

    return {
      diagnostics: [
        ...outsideRootDirectoryDiagnostics,
        ...Precheck.findDefaultExportsDiagnostics(this),
        ...Precheck.findWarningsDiagnostics(this),
        ...compilation.diagnostics,
      ],
      compilation,
    };
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
    schemas,
    mirroredPathByScannedPath,
  }: CompileModuleArgs): MirroredFile {
    this.compileSchemas(schemas);

    this.rewriteSpecifiers({ tsMorphProject, mirroredPathByScannedPath });

    return {
      relativePath: this.path.relative.path,
      text: `${GENERATED_HEADER}\n${this.moduleFile.getFullText()}`,
    };
  }

  /**
   * Finds every Marked-to-Compile Schema in the module, one per
   * `pvl.compile(...)` call, keeping the ones that compile and reporting each
   * one that doesn't with its errors:
   *
   * - COMPILE_RESULT_MODIFIED: something is chained onto the result
   *   (`pvl.compile(user).optional()`).
   * - COMPILE_ARGUMENT_UNRESOLVABLE: the argument can't be read statically, as
   *   when it is imported, built by a function or spread.
   * - COMPILE_ARGUMENT_NOT_COMPOSITE, UNSUPPORTED_SCHEMA: see
   *   Schema.findUncompilableDiagnostics, one error per problem.
   *
   * ```ts
   * import { pvl } from '@pvl/schema';
   * import { address } from './address.js';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() })); // a Schema
   * export const home = pvl.compile(address);                            // COMPILE_ARGUMENT_UNRESOLVABLE
   * ```
   *
   * A module that doesn't import `pvl` from `@pvl/schema` has no call to read.
   */
  public findMarkedToCompileSchemas(): {
    diagnostics: Diagnostic[];
    schemas: Schema[];
  } {
    const diagnostics: Diagnostic[] = [];
    const schemas: Schema[] = [];
    const pvlImportLocalNames = PvlAst.findPvlImportLocalNames(this.moduleFile);

    for (const call of PvlAst.findCompileCalls(this.moduleFile, pvlImportLocalNames)) {
      const line = call.getStartLineNumber();
      const modifierName = PvlAst.findModifierOnCompileMarker(call);

      if (modifierName !== undefined) {
        diagnostics.push(
          new Diagnostic({
            code: DIAGNOSTIC_CODE.COMPILE_RESULT_MODIFIED,
            message: `\`.${modifierName}\` is chained onto the result of pvl.compile() on line ${String(line)}, which is a plain Schema. Chain it inside: pvl.compile(schema.${modifierName}(…)).`,
            file: this.path.absolutePath,
          }),
        );
        continue;
      }

      // The whole call, which the Schema is read through and which compiling replaces.
      const schemaPayload = Schema.read({ module: this, expression: call, pvlImportLocalNames });

      if ('diagnostic' in schemaPayload) {
        diagnostics.push(schemaPayload.diagnostic);
        continue;
      }

      const uncompilableDiagnostics = schemaPayload.schema.findUncompilableDiagnostics();
      if (uncompilableDiagnostics.length > 0) {
        diagnostics.push(...uncompilableDiagnostics);
        continue;
      }

      schemas.push(schemaPayload.schema);
    }
    return { diagnostics, schemas };
  }

  /**
   * Compiles `schemas` into the module in place, in the order given: each
   * Schema's expression becomes `new PvlCompiledSchema<n>()`, and the
   * classes `schema.compile()` writes go right after the module's imports,
   * under one import of what they extend. It compiles every Schema it is
   * given, whether marked to compile or not; the run only passes the
   * Marked-to-Compile Schemas `findMarkedToCompileSchemas` found compilable.
   *
   * ```ts
   * import { pvl } from '@pvl/schema';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
   * // ↓
   * import { pvl } from '@pvl/schema';
   * import { Schema as PvlSchema, … } from '@pvl/schema';
   *
   * // pvl.compile() on line 2
   * class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> { … }
   *
   * export const user = new PvlCompiledSchema0();
   * ```
   *
   * Does nothing when `schemas` is empty.
   */
  public compileSchemas(schemas: ReadonlyArray<Schema>): void {
    if (schemas.length === 0) {
      // Nothing to compile is not an error: the module is mirrored as it is.
      return;
    }

    const classDeclarations = schemas.map((schema, index) =>
      schema.compile(Module.toCompiledSchemaClassName(index)),
    );

    // Last first, so replacing one expression leaves the earlier ones where they were.
    for (const [index, { expression }] of [...schemas.entries()].reverse()) {
      expression.replaceWithText(`new ${Module.toCompiledSchemaClassName(index)}()`);
    }

    const importCount = this.moduleFile
      .getStatements()
      .reduce(
        (count, statement, index) => (Node.isImportDeclaration(statement) ? index + 1 : count),
        0,
      );

    this.moduleFile.insertStatements(
      importCount,
      [COMPILED_SCHEMA_IMPORT, '', classDeclarations.join('\n\n')].join('\n'),
    );
  }

  /** The class name of a module's `index`th Compiled Schema, counted in source order. */
  private static toCompiledSchemaClassName(index: number): string {
    return `PvlCompiledSchema${String(index)}`;
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
      const rewritten = specifier.rewrite({ importerPath: this.path, outputDirectory }).value;

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
      this.path.absolutePath,
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
