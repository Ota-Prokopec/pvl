// One scanned file as the mirror sees it: its parsed source, where it lands
// in the Destination Directory, and compiling it into its mirrored file in
// place, module specifiers rewritten to reach the right files from there.
// `Precheck` checks it before that.
import * as path from 'node:path';
import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type Project,
  type SourceFile,
  type StringLiteral,
  type VariableDeclaration,
} from 'ts-morph';
import { PvlAst } from './ast/pvlAst.js';
import { BaseException } from './exceptions/index.js';
import {
  COMPILED_SCHEMA_IMPORT,
  GENERATED_HEADER,
  STANDALONE_BRAND_IMPORT,
  STANDALONE_BRAND_NAME,
  TYPE_ALIAS_IMPORT,
} from './consts/generatedModule.js';
import { SPECIFIER_TARGET_KIND } from './specifier/enums.js';
import type { Destination } from './destination/destination.js';
import {
  createAbsolutePathWithRelative,
  type AbsolutePath,
  type AbsolutePathWithRelative,
} from './path.js';
import type { Schema } from './schemas/schema.js';
import type { ScannedPath } from './scanner.js';
import { Specifier } from './specifier/specifier.js';
import type { SpecifierTarget } from './specifier/types.js';
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
  /** Whether the module ends with its exported Schemas' type aliases (the `withTypes` setting). */
  withTypes: boolean;
};

export type RewriteSpecifiersArgs = {
  tsMorphProject: Project;
  /** Scanned file's absolute path → its mirrored module's absolute path. */
  mirroredPathByScannedPath: ReadonlyMap<string, MirroredPath>;
};

/** One change to a module's text: `text` in place of what lies between `start` and `end`, inserted when they are equal. */
type TextEdit = {
  start: number;
  end: number;
  text: string;
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
    tsMorphProject,
    schemas,
    mirroredPathByScannedPath,
    withTypes,
  }: CompileModuleArgs): MirroredFile {
    // Read before compiling, which replaces each `pvl.compile(...)` call.
    const schemaNames = withTypes ? this.findExportedSchemaNames() : [];

    this.compileSchemas(schemas);

    this.rewriteSpecifiers({ tsMorphProject, mirroredPathByScannedPath });

    if (schemaNames.length > 0) {
      this.insertAfterImports(TYPE_ALIAS_IMPORT);
    }

    return {
      relativePath: this.path.relativePath.pathFromBase,
      text: `${GENERATED_HEADER}\n${this.moduleFile.getFullText()}${Module.renderTypeAliases(schemaNames)}`,
    };
  }

  /**
   * The names of the module's exported Schemas, in declaration order: each
   * `export const` whose value is a `pvl.*` call chain, read statically,
   * following `const`s, marked to compile or not. A function, an import or a
   * `.validate()` result is no Schema here.
   *
   * ```ts
   * const name = pvl.string();
   * export const user = pvl.object({ name });
   * export const optionalName = name.optional();
   * export const getUser = () => pvl.object({ name });
   * module.findExportedSchemaNames() // ['user', 'optionalName']
   * ```
   */
  private findExportedSchemaNames(): string[] {
    const pvlImportLocalNames = PvlAst.findPvlImportLocalNames(this.moduleFile);

    return this.moduleFile
      .getVariableStatements()
      .filter(
        (statement) =>
          statement.isExported() &&
          statement.getDeclarationKind() === VariableDeclarationKind.Const,
      )
      .flatMap((statement) => statement.getDeclarations())
      .filter((declaration) => Module.holdsSchema(declaration, pvlImportLocalNames))
      .map((declaration) => declaration.getName());
  }

  /**
   * Whether `declaration` binds one name to a Schema: every `pvl.*` method
   * returns one, so any chain that ends in no `.validate()` does. A chain
   * calling a method `@pvl/schema` doesn't have returns nothing known.
   *
   * ```ts
   * const user = pvl.object({ … });      // true
   * const user = base.optional();        // true, with `const base = pvl.string()`
   * const result = user.validate(input); // false: a Result
   * const getUser = () => pvl.string();  // false: a function
   * const { shape } = user;              // false: destructuring
   * const name = pvl.string().foo();     // false: `@pvl/schema` has no `foo`
   * ```
   */
  private static holdsSchema(
    declaration: VariableDeclaration,
    pvlImportLocalNames: ReadonlySet<string>,
  ): boolean {
    const initializer = declaration.getInitializer();
    if (initializer === undefined || !Node.isIdentifier(declaration.getNameNode())) {
      return false;
    }
    try {
      return PvlAst.readCallChain(initializer, pvlImportLocalNames).methods.every(
        ({ methodName }) => methodName !== 'validate',
      );
    } catch (error) {
      if (error instanceof BaseException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * The `Input` and `Output` type aliases the module ends with, one pair per
   * Schema name, typed from its binding through `typeof` (ADR-0036).
   *
   * ```ts
   * Module.renderTypeAliases(['user'])
   * // '\nexport type UserInput = PvlInferInput<typeof user>;\nexport type UserOutput = PvlInferOutput<typeof user>;\n'
   * ```
   */
  private static renderTypeAliases(schemaNames: ReadonlyArray<string>): string {
    if (schemaNames.length === 0) {
      return '';
    }
    const aliasLines = schemaNames.flatMap((name) => {
      const capitalisedName = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      return [
        `export type ${capitalisedName}Input = PvlInferInput<typeof ${name}>;`,
        `export type ${capitalisedName}Output = PvlInferOutput<typeof ${name}>;`,
      ];
    });
    return `\n${aliasLines.join('\n')}\n`;
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
   * written in a top-level `const` the call follows is hoisted, so it is
   * still evaluated once, where it is written (ADR-0030): its value goes into
   * a `const pvlArg<n>` right before that `const`'s declarator, which reads
   * it instead, as does every call it reaches.
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
  public compileSchemas(schemas: ReadonlyArray<Schema>): void {
    if (schemas.length === 0) {
      // Nothing to compile is not an error: the module is mirrored as it is.
      return;
    }

    const moduleText = this.moduleFile.getFullText();
    const outermostSchemas = schemas.filter(
      (schema) =>
        !schemas.some(
          (other) => other !== schema && Module.isWithin(schema.expression, other.expression),
        ),
    );
    const hoistedNameByExpression = this.nameHoistedArguments(outermostSchemas);

    const compiledSchemaEdits: TextEdit[] = outermostSchemas.map((schema, index) => ({
      start: schema.expression.getStart(),
      end: schema.expression.getEnd(),
      text: schema.compile({
        className: Module.toCompiledSchemaClassName(index),
        indentation: Module.findLineIndentation(moduleText, schema.expression.getStart()),
        hoistedNameByExpression,
      }),
    }));
    const edits: TextEdit[] = [
      ...compiledSchemaEdits,
      // One inside another call is passed by its name in that call's own
      // Compiled Schema, which replaces it with the rest of the call.
      ...[...hoistedNameByExpression]
        .filter(
          ([expression]) =>
            !outermostSchemas.some((schema) => Module.isWithin(expression, schema.expression)),
        )
        .map(([expression, hoistedName]) => ({
          start: expression.getStart(),
          end: expression.getEnd(),
          text: hoistedName,
        })),
      ...Module.createHoistedConstEdits(moduleText, hoistedNameByExpression),
    ].sort((left, right) => right.start - left.start);

    // Last first, so applying one edit leaves the earlier ones where they
    // were. By range rather than through the node, as ts-morph would indent
    // the text again by its own count of the node's nesting.
    for (const [index, { start, end, text }] of edits.entries()) {
      const laterEdit = edits[index - 1];
      if (laterEdit !== undefined && laterEdit.start < end) {
        throw new Error(
          `Two edits of ${this.path.absolutePath} overlap, at ${String(laterEdit.start)} and ${String(start)}.`,
        );
      }
      this.moduleFile.replaceText([start, end], text);
    }

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
    const importCount = this.moduleFile
      .getStatements()
      .reduce(
        (count, moduleStatement, index) =>
          Node.isImportDeclaration(moduleStatement) ? index + 1 : count,
        0,
      );

    this.moduleFile.insertStatements(importCount, statement);
  }

  /**
   * The name of the `const` each Runtime Argument written outside the
   * `pvl.compile(...)` call reaching it is hoisted into, by the argument as
   * written: `pvlArg0`, `pvlArg1`, … in source order, skipping any name the
   * module already uses, so none shadows or is shadowed. An argument several
   * calls reach is hoisted once.
   *
   * ```ts
   * // const base = pvl.string().max(getMax());
   * // export const user = pvl.compile(base);
   * module.nameHoistedArguments([<pvl.compile(base)>]) // Map { <getMax()> => 'pvlArg0' }
   * // export const user = (max: number) => pvl.compile(pvl.string().max(max));
   * module.nameHoistedArguments([<pvl.compile(…)>])    // Map {}: written inside the call
   * ```
   */
  private nameHoistedArguments(schemas: ReadonlyArray<Schema>): Map<Node, string> {
    const hoistedExpressions = [
      ...new Set(
        schemas.flatMap((schema) =>
          schema
            .findChainedRuntimeArguments()
            .map(({ argument }) => argument.expression)
            .filter((expression) => !Module.isWithin(expression, schema.expression)),
        ),
      ),
    ].sort((left, right) => left.getStart() - right.getStart());

    const hoistedNames = Module.findUnusedHoistedNames(
      hoistedExpressions.length,
      new Set(
        this.moduleFile
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .map((identifier) => identifier.getText()),
      ),
    );
    return new Map(
      hoistedExpressions.map((expression, index) => [expression, String(hoistedNames[index])]),
    );
  }

  /**
   * The first `count` names `pvlArg0`, `pvlArg1`, … that aren't among
   * `usedNames`.
   *
   * ```ts
   * Module.findUnusedHoistedNames(2, new Set(['pvlArg0'])) // ['pvlArg1', 'pvlArg2']
   * ```
   */
  private static findUnusedHoistedNames(count: number, usedNames: ReadonlySet<string>): string[] {
    const hoistedNames: string[] = [];
    for (let nameIndex = 0; hoistedNames.length < count; nameIndex++) {
      const hoistedName = `pvlArg${String(nameIndex)}`;
      if (!usedNames.has(hoistedName)) {
        hoistedNames.push(hoistedName);
      }
    }
    return hoistedNames;
  }

  /**
   * The edits declaring each hoisted Runtime Argument, `const pvlArg<n> = …;`,
   * right before the declarator of the top-level `const` it is written in,
   * so it is evaluated where it was, in the same order. A declarator after
   * the first of its statement is split off into a statement of its own
   * first, keeping the statement's keywords.
   *
   * Each argument itself is replaced by its name through an edit of its own.
   *
   * ```ts
   * // const base = pvl.string().max(getMax());
   * // → const pvlArg0 = getMax();
   * //   const base = pvl.string().max(getMax());
   * // export const a = 1, base = pvl.string().max(a + 1);
   * // → export const a = 1;
   * //   const pvlArg0 = a + 1;
   * //   export const base = pvl.string().max(a + 1);
   * ```
   *
   * Throws for an argument outside any top-level `const`, which a call can't
   * follow, so is a bug in the compiler, never a user error.
   */
  private static createHoistedConstEdits(
    moduleText: string,
    hoistedNameByExpression: ReadonlyMap<Node, string>,
  ): TextEdit[] {
    const hoistedExpressionsByDeclaration = new Map<VariableDeclaration, Node[]>();
    for (const expression of hoistedNameByExpression.keys()) {
      const declaration = Module.findTopLevelDeclaration(expression);
      hoistedExpressionsByDeclaration.set(declaration, [
        ...(hoistedExpressionsByDeclaration.get(declaration) ?? []),
        expression,
      ]);
    }

    return [...hoistedExpressionsByDeclaration].map(([declaration, expressions]) => {
      const statement = declaration.getVariableStatementOrThrow();
      const declarations = statement.getDeclarations();
      const position = declarations.indexOf(declaration);
      const indentation = Module.findLineIndentation(moduleText, statement.getStart());
      const hoistedConsts = expressions
        .map(
          (expression) =>
            `const ${String(hoistedNameByExpression.get(expression))} = ${expression.getText()};`,
        )
        .join(`\n${indentation}`);
      const previousDeclaration = declarations[position - 1];
      const firstDeclaration = declarations[0];

      if (previousDeclaration === undefined || firstDeclaration === undefined) {
        const statementStart = statement.getStart(true);
        return {
          start: statementStart,
          end: statementStart,
          text: `${hoistedConsts}\n${indentation}`,
        };
      }
      const keywords = moduleText.slice(statement.getStart(), firstDeclaration.getStart());
      return {
        start: previousDeclaration.getEnd(),
        end: declaration.getStart(),
        text: `;\n${indentation}${hoistedConsts}\n${indentation}${keywords}`,
      };
    });
  }

  /**
   * The top-level `const` declarator `node` is written in. Throws when there
   * is none, which a call can't follow, so is a bug in the compiler.
   */
  private static findTopLevelDeclaration(node: Node): VariableDeclaration {
    const declaration = node.getFirstAncestor(
      (ancestor): ancestor is VariableDeclaration =>
        Node.isVariableDeclaration(ancestor) &&
        ancestor.getVariableStatement()?.getParent() === node.getSourceFile(),
    );
    if (declaration === undefined) {
      throw new Error(`\`${node.getText()}\` is in no top-level const, so it can't be hoisted.`);
    }
    return declaration;
  }

  /** Whether `node` lies within `container`'s text, `container` itself included. */
  private static isWithin(node: Node, container: Node): boolean {
    return container.getStart() <= node.getStart() && node.getEnd() <= container.getEnd();
  }

  /** The class name of a module's `index`th Compiled Schema, counted in source order. */
  private static toCompiledSchemaClassName(index: number): string {
    return `PvlCompiledSchema${String(index)}`;
  }

  /**
   * The whitespace the line holding `position` in `moduleText` starts with.
   *
   * ```ts
   * Module.findLineIndentation('if (x) {\n    return pvl.compile(a);\n}', 20) // '    '
   * Module.findLineIndentation('export const u = pvl.compile(a);', 17)        // ''
   * ```
   */
  private static findLineIndentation(moduleText: string, position: number): string {
    const lineStart = moduleText.lastIndexOf('\n', position - 1) + 1;
    const lineText = moduleText.slice(lineStart, position);
    return lineText.slice(0, lineText.length - lineText.trimStart().length);
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
    const outputDirectory: AbsolutePath = { absolutePath: path.dirname(this.mirroredPath) };

    for (const literal of Module.findSpecifierLiterals(this.moduleFile)) {
      const specifier = new Specifier(literal.getLiteralValue());
      const rewritten = specifier.rewrite({
        target: this.resolveSpecifierTarget({
          specifier,
          tsMorphProject,
          mirroredPathByScannedPath,
        }),
        importerPath: this.path,
        outputDirectory,
      });

      if (rewritten.value !== specifier.value) {
        literal.setLiteralValue(rewritten.value);
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
      : { kind: SPECIFIER_TARGET_KIND.MIRRORED, path: { absolutePath: mirroredPath } };
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
