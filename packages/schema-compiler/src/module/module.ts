// One scanned file as the mirror sees it: its parsed source, where it lands
// in the Destination Directory, and compiling it into its mirrored file in
// place, module specifiers rewritten to reach the right files from there.
// `Precheck` checks it before that.
import * as path from 'node:path';
import type { Project, SourceFile } from 'ts-morph';
import { GenericAst } from '../ast/genericAst.js';
import { PvlAst } from '../ast/pvlAst.js';
import type { Destination } from '../destination/destination.js';
import { STANDALONE_BRAND_NAME } from '../frame/consts.js';
import {
  createAbsolutePathWithRelative,
  type AbsolutePath,
  type AbsolutePathWithRelative,
} from '../path.js';
import { HoistedArguments } from '../runtimeArgument/hoistedArguments.js';
import type { ScannedPath } from '../scanner.js';
import type { Schema } from '../schemas/schema.js';
import { SPECIFIER_TARGET_KIND } from '../specifier/enums.js';
import { Specifier } from '../specifier/specifier.js';
import type { SpecifierTarget } from '../specifier/types.js';
import { TsMorphProject } from '../tsMorphProject.js';
import {
  COMPILED_SCHEMA_CLASS_NAME_PREFIX,
  COMPILED_SCHEMA_IMPORT,
  GENERATED_HEADER,
  STANDALONE_BRAND_IMPORT,
  TYPE_ALIAS_IMPORT,
} from './consts.js';
import type { MirroredFile, MirroredPath, TextEdit } from './types.js';
import { findLineIndentation, renderTypeAliases } from './utils.js';

/** A scanned file, the project it is read into, and the directories that place it in the mirror. */
type ModuleOptions = {
  /** The scanned file's absolute path. */
  scannedFilePath: ScannedPath;
  /** The ts-morph project the file is read into. */
  tsMorphProject: Project;
  /** The Root Directory's absolute path. */
  rootDirectory: string;
  destination: Destination;
};

type CompileModuleArgs = {
  /** The module's Marked-to-Compile Schemas that compile. */
  schemas: ReadonlyArray<Schema>;
  /** Lets an import of another scanned file point at that file's mirror instead. */
  mirroredPathByScannedPath: ReadonlyMap<ScannedPath, MirroredPath>;
  /** Whether the module ends with its exported Schemas' type aliases (the `withTypes` setting). */
  withTypes: boolean;
};

/**
 * One scanned file. Its `path.relativePath.pathFromBase` is relative to the Root Directory,
 * which is also its path inside the Destination Directory.
 *
 * ```ts
 * const user = new Module({ …, scannedFilePath: '/repo/src/schemas/user.ts' });
 * user.path.relativePath.pathFromBase // 'schemas/user.ts'
 * user.mirroredPath       // '/repo/.pvl/schemas/user.ts'
 * ```
 */
export class Module {
  /** Where the scanned file is: its absolute path, and its path relative to the Root Directory. */
  public readonly path: AbsolutePathWithRelative<ScannedPath>;

  /** Its ts-morph source file, which the mirror reads and rewrites in place. */
  public readonly moduleFile: SourceFile;
  /** The absolute path of its mirrored module. */
  public readonly mirroredPath: MirroredPath;

  /**
   * The scanned file at `scannedFilePath`, read into `tsMorphProject` and
   * placed in the mirror. A file outside the Root Directory gets a
   * `path.relativePath.pathFromBase` starting with `..` (or an absolute one, on another
   * drive), which FILE_OUTSIDE_ROOT_DIR reports.
   *
   * With Root Directory `/repo/src` and Destination Directory `/repo/.pvl`:
   *
   * ```ts
   * new Module({ …, scannedFilePath: '/repo/src/schemas/user.ts' })
   * // Module { path: { absolutePath: '/repo/src/schemas/user.ts',
   * //     relativePath: { absoluteBase: '/repo/src', pathFromBase: 'schemas/user.ts' } },
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
    this.path = createAbsolutePathWithRelative(scannedFilePath, rootDirectory);
    this.moduleFile = tsMorphProject.addSourceFileAtPath(scannedFilePath);
    this.mirroredPath = path.join(
      destination.absolutePath,
      this.path.relativePath.pathFromBase,
    ) as MirroredPath;
  }

  /**
   * Turns the module into its mirrored file by editing its source file in
   * place: replaces its `pvl.compile(...)` calls with straight-line code,
   * points its module specifiers at the right files from the mirrored
   * location, appends its exported Schemas' type aliases under `withTypes`,
   * then prepends the `@generated` header.
   *
   * ```ts
   * // /repo/src/schemas/user.ts, mirrored to /repo/.pvl/schemas/user.ts
   * import { pvl } from '@pvl/schema';
   * import { tags } from '../lib/tags.js';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
   * // module.compile({ …, withTypes: true })
   * // → { relativePath: 'schemas/user.ts', text: '<@generated header>\n…' }, where
   * //   '../lib/tags.js' becomes '../../src/lib/tags.js', `pvl.compile(...)`
   * //   becomes an instance of its emitted Compiled Schema class, and the
   * //   module ends with `export type UserInput = …;` and `export type UserOutput = …;`
   * ```
   */
  public compile({
    schemas,
    mirroredPathByScannedPath,
    withTypes,
  }: CompileModuleArgs): MirroredFile {
    // Read before compiling, which replaces each `pvl.compile(...)` call.
    const schemaNames = withTypes ? PvlAst.findExportedSchemaNames(this.moduleFile) : [];

    this.compileSchemas(schemas);

    this.rewriteSpecifiers(mirroredPathByScannedPath);

    if (schemaNames.length > 0) {
      this.insertAfterImports(TYPE_ALIAS_IMPORT);
      this.moduleFile.addStatements(renderTypeAliases(schemaNames));
    }

    return {
      relativePath: this.path.relativePath.pathFromBase,
      text: `${GENERATED_HEADER}\n${this.moduleFile.getFullText()}`,
    };
  }

  /**
   * Compiles `schemas` into the module in place, in the order given: each
   * Schema's expression becomes its Compiled Schema, an instance of the class
   * expression `schema.compile()` writes, indented to the line it starts on,
   * and one type-only import of what the classes implement goes right after
   * the module's imports. It compiles every Schema it is given, whether
   * marked to compile or not; the run only passes the Marked-to-Compile
   * Schemas `findMarkedToCompileSchemas` found compilable. A Schema inside
   * another one's expression is compiled into that one, so only the
   * outermost is replaced, and the classes are numbered among those.
   *
   * A Runtime Argument written inside the call is passed as written. One
   * written in a top-level `const` the call follows is hoisted
   * (`HoistedArguments`), so it is still evaluated once, where it is written
   * (ADR-0030).
   *
   * ```ts
   * import { pvl } from '@pvl/schema';
   * const base = pvl.string().max(getMax());
   * export const getUser = (min: number) => pvl.compile(base.min(min));
   * // ↓
   * import { pvl } from '@pvl/schema';
   * import type { …, Schema as PvlSchema, … } from '@pvl/schema';
   * const pvlArg0 = getMax();
   * const base = pvl.string().max(pvlArg0);
   * export const getUser = (min: number) => (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
   *   …
   * })(pvlArg0, min) as PvlSchema<string, string>);
   * ```
   *
   * Does nothing when `schemas` is empty.
   */
  private compileSchemas(schemas: ReadonlyArray<Schema>): void {
    if (schemas.length === 0) {
      // Nothing to compile is not an error: the module is mirrored as it is.
      return;
    }

    const moduleText = this.moduleFile.getFullText();

    // Outermost among `schemas`, not the module's top level: one inside a
    // function counts, while one inside another is inlined into that one (so that one is not compiled).
    const outermostSchemas = schemas.filter(
      (schema) =>
        !schemas.some(
          (other) => other !== schema && GenericAst.isWithin(schema.expression, other.expression),
        ),
    );

    const hoistedArguments = new HoistedArguments({
      schemas: outermostSchemas,
      sourceFile: this.moduleFile,
    });

    const compiledSchemaEdits: TextEdit[] = outermostSchemas.map((schema, index) => ({
      start: schema.expression.getStart(),
      end: schema.expression.getEnd(),
      text: schema.compile({
        className: `${COMPILED_SCHEMA_CLASS_NAME_PREFIX}${String(index)}`,
        indentation: findLineIndentation(moduleText, schema.expression.getStart()),
        hoistedNameByExpression: hoistedArguments.nameByExpression,
      }),
    }));
    const edits = [...compiledSchemaEdits, ...hoistedArguments.edits].sort(
      (left, right) => left.start - right.start,
    );

    // ts-morph splices them in by range, all at once, rather than through
    // the node, which it would indent again by its own count of the node's
    // nesting. It doesn't check that none overlap, so that is checked here.
    for (const [index, edit] of edits.entries()) {
      const nextEdit = edits[index + 1];
      if (nextEdit !== undefined && nextEdit.start < edit.end) {
        throw new Error(
          `Two edits of ${this.path.absolutePath} overlap, at ${String(edit.start)} and ${String(nextEdit.start)}.`,
        );
      }
    }

    this.moduleFile.applyTextChanges(
      edits.map(({ start, end, text }) => ({
        span: { start, length: end - start },
        newText: text,
      })),
    );

    this.insertAfterImports(COMPILED_SCHEMA_IMPORT);
    // Read off the text: the brand is declared only where a Compiled Schema
    // is marked `.standalone()`, its own or one it exposes.
    if (compiledSchemaEdits.some(({ text }) => text.includes(STANDALONE_BRAND_NAME))) {
      this.insertAfterImports(STANDALONE_BRAND_IMPORT);
    }
  }

  /**
   * Inserts `statement` into the module right after its last import.
   *
   * ```ts
   * // import { pvl } from '@pvl/schema';
   * // export const user = pvl.string();
   * module.insertAfterImports(TYPE_ALIAS_IMPORT)
   * // import { pvl } from '@pvl/schema';
   * // import type { InferInput as PvlInferInput, … } from '@pvl/schema';
   * // export const user = pvl.string();
   * ```
   */
  private insertAfterImports(statement: string): void {
    const lastImport = this.moduleFile.getImportDeclarations().at(-1);
    this.moduleFile.insertStatements(
      lastImport === undefined ? 0 : lastImport.getChildIndex() + 1,
      statement,
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
  private rewriteSpecifiers(
    mirroredPathByScannedPath: ReadonlyMap<ScannedPath, MirroredPath>,
  ): void {
    const outputDirectory: AbsolutePath = { absolutePath: path.dirname(this.mirroredPath) };

    for (const literal of GenericAst.findModuleSpecifierLiterals(this.moduleFile)) {
      const specifier = new Specifier(literal.getLiteralValue());
      const rewritten = specifier.rewrite({
        target: this.resolveSpecifierTarget(specifier, mirroredPathByScannedPath),
        importerPath: this.path,
        outputDirectory,
      });

      if (rewritten.moduleSpecifierAsString !== specifier.moduleSpecifierAsString) {
        literal.setLiteralValue(rewritten.moduleSpecifierAsString);
      }
    }
  }

  /**
   * What `specifier` reaches, resolved from the module's original location,
   * where it was written, not from its mirrored one: a scanned file's
   * mirrored module, an unscanned file of the repository, or nothing the
   * mirror rewrites toward (a package, or no file at all).
   */
  private resolveSpecifierTarget(
    specifier: Specifier,
    // Keyed by `string`, so the resolved file's plain path is looked up as it is.
    mirroredPathByScannedPath: ReadonlyMap<string, MirroredPath>,
  ): SpecifierTarget {
    const moduleFile = TsMorphProject.resolveModuleFile(
      this.moduleFile.getProject(),
      specifier,
      this.path.absolutePath,
    );
    if (moduleFile === undefined || moduleFile.isPackage) {
      return { kind: SPECIFIER_TARGET_KIND.UNRESOLVED };
    }

    const mirroredPath = mirroredPathByScannedPath.get(moduleFile.absolutePath);
    return mirroredPath === undefined
      ? { kind: SPECIFIER_TARGET_KIND.REPOSITORY, path: moduleFile }
      : { kind: SPECIFIER_TARGET_KIND.MIRRORED, path: { absolutePath: mirroredPath } };
  }
}
