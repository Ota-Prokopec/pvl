// The Runtime Arguments a module's `pvl.compile(...)` calls reach outside
// their own expression, each hoisted into a `const pvlArg<n>` so it is still
// evaluated once, where it is written (ADR-0030), and the edits to the
// module's text that hoist them.
import { SyntaxKind, type Node, type SourceFile, type VariableDeclaration } from 'ts-morph';
import { GenericAst } from '../ast/genericAst.js';
import type { TextEdit } from '../module/types.js';
import { findLineIndentation } from '../module/utils.js';
import type { Schema } from '../schemas/schema.js';
import { HOISTED_ARGUMENT_NAME_PREFIX } from './consts.js';

/** The Schemas a module compiles and the file they are written in, whose Runtime Arguments are hoisted. */
export type HoistedArgumentsOptions = {
  /** The Schemas whose expressions the module replaces, none within another. */
  schemas: ReadonlyArray<Schema>;
  sourceFile: SourceFile;
};

/**
 * The Runtime Arguments `schemas` reach that are written outside their own
 * expression, in a top-level `const` the call follows. Each one's value
 * goes into a `const pvlArg<n>` right before that `const`'s declarator,
 * which reads it instead, as does every call it reaches.
 *
 * ```ts
 * // const base = pvl.string().max(getMax());
 * // export const user = pvl.compile(base);
 * const hoistedArguments = new HoistedArguments({ schemas: [<pvl.compile(base)>], sourceFile });
 * hoistedArguments.nameByExpression // Map { <getMax()> => 'pvlArg0' }
 * hoistedArguments.edits
 * // [<getMax()> → 'pvlArg0', 'const pvlArg0 = getMax();\n' inserted before `const base`]
 * // → const pvlArg0 = getMax();
 * //   const base = pvl.string().max(pvlArg0);
 * ```
 */
export class HoistedArguments {
  /** The name of the `const` each one is hoisted into, by the argument as written, which each Compiled Schema passes for it. */
  public readonly nameByExpression: ReadonlyMap<Node, string>;
  /**
   * The edits that hoist them: each `const pvlArg<n> = …;`, and each
   * argument outside every one of `schemas` replaced by its name. One inside
   * one of them is passed by its name in that Schema's own Compiled Schema,
   * which replaces it with the rest of the call.
   */
  public readonly edits: ReadonlyArray<TextEdit>;

  /** The Runtime Arguments `schemas`, in `sourceFile`, reach from outside their own expression. */
  public constructor({ schemas, sourceFile }: HoistedArgumentsOptions) {
    this.nameByExpression = HoistedArguments.nameArguments(schemas, sourceFile);
    this.edits = [
      ...[...this.nameByExpression]
        .filter(
          ([expression]) =>
            !schemas.some((schema) => GenericAst.isWithin(expression, schema.expression)),
        )
        .map(([expression, hoistedName]) => ({
          start: expression.getStart(),
          end: expression.getEnd(),
          text: hoistedName,
        })),
      ...HoistedArguments.createConstEdits(sourceFile.getFullText(), this.nameByExpression),
    ];
  }

  /**
   * The name of the `const` each Runtime Argument written outside the
   * `pvl.compile(...)` call reaching it is hoisted into, by the argument as
   * written: `pvlArg0`, `pvlArg1`, … in source order, skipping any name
   * `sourceFile` already uses, so none shadows or is shadowed. An argument
   * several calls reach is hoisted once.
   *
   * ```ts
   * // const base = pvl.string().max(getMax());
   * // export const user = pvl.compile(base);
   * HoistedArguments.nameArguments([<pvl.compile(base)>], sourceFile) // Map { <getMax()> => 'pvlArg0' }
   * // export const user = (max: number) => pvl.compile(pvl.string().max(max));
   * HoistedArguments.nameArguments([<pvl.compile(…)>], sourceFile)    // Map {}: written inside the call
   * ```
   */
  private static nameArguments(
    schemas: ReadonlyArray<Schema>,
    sourceFile: SourceFile,
  ): Map<Node, string> {
    const hoistedExpressions = [
      ...new Set(
        schemas.flatMap((schema) =>
          schema
            .findChainedRuntimeArguments()
            .map(({ argument }) => argument.expression)
            .filter((expression) => !GenericAst.isWithin(expression, schema.expression)),
        ),
      ),
    ].sort((left, right) => left.getStart() - right.getStart());

    const hoistedNames = HoistedArguments.findUnusedNames(
      hoistedExpressions.length,
      new Set(
        sourceFile
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
   * HoistedArguments.findUnusedNames(2, new Set(['pvlArg0'])) // ['pvlArg1', 'pvlArg2']
   * ```
   */
  private static findUnusedNames(count: number, usedNames: ReadonlySet<string>): string[] {
    const hoistedNames: string[] = [];
    for (let nameIndex = 0; hoistedNames.length < count; nameIndex++) {
      const hoistedName = `${HOISTED_ARGUMENT_NAME_PREFIX}${String(nameIndex)}`;
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
  private static createConstEdits(
    moduleText: string,
    nameByExpression: ReadonlyMap<Node, string>,
  ): TextEdit[] {
    const expressionsByDeclaration = new Map<VariableDeclaration, Node[]>();
    for (const expression of nameByExpression.keys()) {
      const declaration = GenericAst.findEnclosingTopLevelConst(expression);
      if (declaration === undefined) {
        throw new Error(
          `\`${expression.getText()}\` is in no top-level const, so it can't be hoisted.`,
        );
      }
      expressionsByDeclaration.set(declaration, [
        ...(expressionsByDeclaration.get(declaration) ?? []),
        expression,
      ]);
    }

    return [...expressionsByDeclaration].map(([declaration, expressions]) => {
      const statement = declaration.getVariableStatementOrThrow();
      const declarations = statement.getDeclarations();
      const position = declarations.indexOf(declaration);
      const indentation = findLineIndentation(moduleText, statement.getStart());
      const hoistedConsts = expressions
        .map(
          (expression) =>
            `const ${String(nameByExpression.get(expression))} = ${expression.getText()};`,
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
}
