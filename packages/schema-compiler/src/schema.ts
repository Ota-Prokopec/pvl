// A Schema as the compiler knows it: one Schema written in a Module, read
// from source statically (ADR-0002), and compiled into its Compiled Schema. Only a `pvl.*` call chain, a literal or a top-level `const` of the
// same file holding one is understood. Nothing is imported or executed.
import type { EnumMember, PossibleLiteralValue } from '@pvl/schema';
import { Node, SyntaxKind, VariableDeclarationKind, type CallExpression } from 'ts-morph';
import { CompiledSchemaWriter } from './compilation/generate/compiledSchemaWriter.js';
import { Diagnostic } from './diagnostics/diagnostic.js';
import { SCHEMA_FACTORY, type SchemaFactory } from './enums.js';
import type { Module } from './module.js';

/** An argument written as a literal in source: `3`, `'a'`, `10n`, `{ message: 'too short' }`. */
export type StaticValue =
  | string
  | number
  | boolean
  | bigint
  | ReadonlyArray<StaticValue>
  | { readonly [key: string]: StaticValue };

/** One method chained onto a Schema: `.min(3, { message: 'too short' })`. */
export type SchemaMethodCall = {
  name: string;
  /** `undefined` when an argument isn't a literal, such as `.refine()`'s function. */
  args: ReadonlyArray<StaticValue> | undefined;
  /** The 1-based line it is written on. */
  line: number;
};

/** One field of an object Schema. */
export type ObjectField = {
  key: string;
  schema: SchemaModel;
};

/**
 * A Schema as read from source: the factory that built it, that factory's
 * arguments, and every method chained onto it, in chain order.
 *
 * ```ts
 * pvl.object({ name: pvl.string().min(3) }).strict()
 * // { factory: 'object', calls: [{ name: 'strict', args: [] }],
 * //   shape: [{ key: 'name', schema: { factory: 'string', calls: [{ name: 'min', args: [3] }] } }] }
 * ```
 */
export type SchemaModel = {
  /** Every method chained onto the factory call, in chain order. */
  calls: ReadonlyArray<SchemaMethodCall>;
  /** The 1-based line the factory call is written on. */
  line: number;
} & (
  | {
      factory:
        | typeof SCHEMA_FACTORY.STRING
        | typeof SCHEMA_FACTORY.NUMBER
        | typeof SCHEMA_FACTORY.BOOLEAN
        | typeof SCHEMA_FACTORY.BIGINT;
    }
  | { factory: typeof SCHEMA_FACTORY.LITERAL; literalValue: PossibleLiteralValue }
  | { factory: typeof SCHEMA_FACTORY.ENUM; members: ReadonlyArray<EnumMember> }
  | { factory: typeof SCHEMA_FACTORY.OBJECT; shape: ReadonlyArray<ObjectField> }
  | { factory: typeof SCHEMA_FACTORY.ARRAY; element: SchemaModel }
  | { factory: typeof SCHEMA_FACTORY.UNION; members: ReadonlyArray<SchemaModel> }
);

/** The expression a Schema is read from, and the Module it is written in. */
export type ReadSchemaArgs = {
  module: Module;
  /** A `pvl.*` call chain, a `const` holding one, or a `pvl.compile(...)` call, which is read through. */
  expression: Node;
  /** The Local Names `pvl` is imported under from `@pvl/schema`. */
  pvlImportLocalNames: ReadonlySet<string>;
};

// Thrown at the first node that can't be read, and caught by `Schema.read`.
class UnresolvedNodeError extends Error {
  public readonly unresolvedNode: Node;

  public constructor(unresolvedNode: Node) {
    super(`Can't read ${unresolvedNode.getText()} statically.`);
    this.unresolvedNode = unresolvedNode;
  }
}

const SCHEMA_FACTORIES: ReadonlySet<string> = new Set(Object.values(SCHEMA_FACTORY));

/**
 * One Schema written in a Module, which holds any number of them. Its
 * `compile` compiles it whether it is marked to compile or not; which
 * Schemas get compiled is the caller's choice (see
 * `Module.findMarkedToCompileSchemas`).
 *
 * ```ts
 * // /repo/src/schemas/user.ts
 * // export const user = pvl.compile(pvl.object({ name: pvl.string() }));
 * const { schema } = Schema.read({ module: user, expression: <pvl.compile(…)>, pvlImportLocalNames });
 * schema.findUncompilableDiagnostics(); // []: a Compilable Schema
 * schema.compile('PvlCompiledSchema0');  // 'class PvlCompiledSchema0 extends PvlSchema<…> { … }'
 * ```
 */
export class Schema {
  /** The Module it is written in. */
  public readonly module: Module;
  /** The expression it is read from, which compiling it replaces. */
  public readonly expression: Node;
  /** The Schema as read from source. */
  public readonly model: SchemaModel;

  // The Local Names `pvl` is imported under, which mark a factory call.
  private readonly pvlImportLocalNames: ReadonlySet<string>;
  // The `const`s being followed, so a cycle (`const a = b; const b = a;`)
  // is unresolvable rather than endless.
  private readonly followedConstNames = new Set<string>();

  // Throws an UnresolvedNodeError at the first node that can't be read.
  private constructor({ module, expression, pvlImportLocalNames }: ReadSchemaArgs) {
    this.module = module;
    this.expression = expression;
    this.pvlImportLocalNames = pvlImportLocalNames;
    this.model = this.readSchema(expression);
  }

  /**
   * The Schema `expression` holds, or the first node that can't be read
   * statically.
   *
   * ```ts
   * // const MIN = 3;
   * // export const user = pvl.compile(pvl.object({ name: pvl.string().min(MIN) }));
   * Schema.read({ expression: <pvl.compile(…)>, … })
   * // { schema: <Schema whose model is { factory: 'object', shape: [{ key: 'name', schema: { factory: 'string', calls: [min(3)] } }] }> }
   * Schema.read({ expression: <pvl.object({ name: pvl.string() })>, … }) // { schema: <Schema> }: not marked, still read
   * // export const home = pvl.compile(importedAddress);
   * Schema.read({ expression: <pvl.compile(importedAddress)>, … }) // { unresolvedNode: <importedAddress> }
   * ```
   */
  public static read(args: ReadSchemaArgs): { schema: Schema } | { unresolvedNode: Node } {
    try {
      return { schema: new Schema(args) };
    } catch (error) {
      if (error instanceof UnresolvedNodeError) {
        return { unresolvedNode: error.unresolvedNode };
      }
      throw error;
    }
  }

  /**
   * Its diagnostics, one per problem, each on its Module's file; none means it
   * is a Compilable Schema (see `CompiledSchemaWriter.findUncompilableDiagnostics`).
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string() }))>.findUncompilableDiagnostics() // []
   * <pvl.compile(pvl.string())>.findUncompilableDiagnostics()                      // [COMPILE_ARGUMENT_NOT_COMPOSITE]
   * ```
   */
  public findUncompilableDiagnostics(): Diagnostic[] {
    return CompiledSchemaWriter.findUncompilableDiagnostics(this.model).map(
      (diagnostic) => new Diagnostic({ ...diagnostic, file: this.module.absolutePath }),
    );
  }

  /**
   * Its Compiled Schema: the class declaration named `className`, whose
   * instance replaces its expression. Compiles any Schema, marked to compile
   * or not, so long as `findUncompilableDiagnostics` found nothing.
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string() })) on line 3>.compile('PvlCompiledSchema0')
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> { … }
   * ```
   */
  public compile(className: string): string {
    return CompiledSchemaWriter.emitCompiledSchema({
      schema: this.model,
      className,
      line: this.expression.getStartLineNumber(),
    });
  }

  // A `pvl.<factory>(…)` call with methods chained onto it, read from the
  // outside in: `<receiver>.<name>(…)` is the factory when `receiver` is
  // `pvl`, and otherwise a method appended to the receiver's Schema.
  //
  //   pvl.string().min(3)       // { factory: 'string', calls: [min(3)] }
  //   pvl.string().refine(isOk) // { factory: 'string', calls: [refine(args: undefined)] }
  //   user                      // what `const user = …` holds
  //   makeSchema(), z.string()  // unresolvable
  private readSchema(expression: Node): SchemaModel {
    const call = this.followConst(expression);
    const callee = Node.isCallExpression(call) ? call.getExpression() : undefined;
    if (!Node.isCallExpression(call) || !Node.isPropertyAccessExpression(callee)) {
      throw new UnresolvedNodeError(call);
    }
    const name = callee.getName();
    const receiver = callee.getExpression();
    if (Node.isIdentifier(receiver) && this.pvlImportLocalNames.has(receiver.getText())) {
      return this.getFactory(name, call);
    }
    const schema = this.readSchema(receiver);
    const args = this.tryReadStaticValues(call.getArguments());
    return { ...schema, calls: [...schema.calls, { name, args, line: call.getStartLineNumber() }] };
  }

  // `pvl.<name>(argument)` with nothing chained onto it yet. `compile` reads
  // through to its argument; every other factory but the primitives needs
  // its argument.
  //
  //   pvl.string()                            // { factory: 'string', calls: [] }
  //   pvl.literal('a')                        // { factory: 'literal', literalValue: 'a', … }
  //   pvl.enum(['A', 'B'])                    // { factory: 'enum', members: ['A', 'B'], … }
  //   pvl.object({ name: pvl.string() })      // { factory: 'object', shape: [{ key: 'name', … }], … }
  //   pvl.array(pvl.number())                 // { factory: 'array', element: { factory: 'number', … }, … }
  //   pvl.union([pvl.string(), pvl.number()]) // { factory: 'union', members: [string, number], … }
  //   pvl.compile(pvl.string())               // the argument's Schema
  private getFactory(name: string, call: CallExpression): SchemaModel {
    const [argument] = call.getArguments();
    const base = { calls: [], line: call.getStartLineNumber() };
    if (name === 'compile' && argument !== undefined) {
      return this.readSchema(argument);
    }
    if (!SCHEMA_FACTORIES.has(name)) {
      throw new UnresolvedNodeError(call);
    }
    const factory = name as SchemaFactory;
    if (
      factory === SCHEMA_FACTORY.STRING ||
      factory === SCHEMA_FACTORY.NUMBER ||
      factory === SCHEMA_FACTORY.BOOLEAN ||
      factory === SCHEMA_FACTORY.BIGINT
    ) {
      return { ...base, factory };
    }
    if (argument === undefined) {
      throw new UnresolvedNodeError(call);
    }
    switch (factory) {
      case SCHEMA_FACTORY.LITERAL:
        return { ...base, factory, literalValue: this.readLiteralValue(argument) };
      case SCHEMA_FACTORY.ENUM:
        return { ...base, factory, members: this.readEnumMembers(argument) };
      case SCHEMA_FACTORY.OBJECT:
        return {
          ...base,
          factory,
          shape: Object.entries(this.readObject(argument, (node) => this.readSchema(node))).map(
            ([key, schema]) => ({ key, schema }),
          ),
        };
      case SCHEMA_FACTORY.ARRAY:
        return { ...base, factory, element: this.readSchema(argument) };
      case SCHEMA_FACTORY.UNION: {
        const members = this.followConst(argument);
        if (!Node.isArrayLiteralExpression(members)) {
          throw new UnresolvedNodeError(members);
        }
        return {
          ...base,
          factory,
          members: members.getElements().map((member) => this.readSchema(member)),
        };
      }
    }
  }

  // `pvl.literal()`'s argument: a literal that isn't an object or an array.
  private readLiteralValue(argument: Node): PossibleLiteralValue {
    const value = this.readStaticValue(argument);
    if (typeof value === 'object') {
      throw new UnresolvedNodeError(argument);
    }
    return value;
  }

  // `pvl.enum()`'s argument, a string array or an object of strings and
  // numbers, as its members, each once, as `EnumSchema` keeps them in a Set.
  //
  //   ['A', 'B', 'A']  // ['A', 'B']
  //   { A: 'a', B: 1 } // ['a', 1]
  private readEnumMembers(argument: Node): EnumMember[] {
    const value = this.readStaticValue(argument);
    const members = typeof value === 'object' ? Object.values(value) : [];
    if (
      members.length === 0 ||
      !members.every(
        (member): member is EnumMember => typeof member === 'string' || typeof member === 'number',
      )
    ) {
      throw new UnresolvedNodeError(argument);
    }
    return [...new Set(members)];
  }

  // A method's arguments, or `undefined` when one isn't a literal.
  private tryReadStaticValues(args: ReadonlyArray<Node>): StaticValue[] | undefined {
    try {
      return args.map((argument) => this.readStaticValue(argument));
    } catch (error) {
      if (error instanceof UnresolvedNodeError) {
        return undefined;
      }
      throw error;
    }
  }

  // `node` as a literal value, following `const`s:
  //
  //   3, -1, 10n, 'a', `a`, true    // as written
  //   { message: 'x' }, ['A', 'B']  // the object or array
  //   MIN                            // what `const MIN = 3` holds
  //   Math.max(1, 2)                 // unresolvable
  private readStaticValue(node: Node): StaticValue {
    const value = this.followConst(node);
    if (
      Node.isStringLiteral(value) ||
      Node.isNoSubstitutionTemplateLiteral(value) ||
      Node.isNumericLiteral(value) ||
      Node.isTrueLiteral(value) ||
      Node.isFalseLiteral(value)
    ) {
      return value.getLiteralValue();
    }
    if (Node.isBigIntLiteral(value)) {
      return value.getLiteralValue() as bigint;
    }
    if (Node.isPrefixUnaryExpression(value) && value.getOperatorToken() === SyntaxKind.MinusToken) {
      const operand = this.readStaticValue(value.getOperand());
      if (typeof operand === 'number' || typeof operand === 'bigint') {
        return -operand;
      }
    }
    if (Node.isArrayLiteralExpression(value)) {
      return value.getElements().map((element) => this.readStaticValue(element));
    }
    if (Node.isObjectLiteralExpression(value)) {
      // Spread back onto a plain object, which keeps an own `__proto__` key.
      return { ...this.readObject(value, (property) => this.readStaticValue(property)) };
    }
    throw new UnresolvedNodeError(value);
  }

  // An object literal's own keys, each value read with `readValue`, in the
  // order they take at runtime: integer-like keys first, ascending, then the
  // rest as written. A key written twice keeps its first place and its last
  // value. A plain `__proto__: …` sets the prototype, so it is no key.
  //
  //   { name: pvl.string(), 'e-mail': email, age } // three keys
  //   { b: 1, 1: 2 }                                // '1', then 'b'
  //   { ['__proto__']: 1 }                          // one key, `__proto__`
  //   { ...base }, { [key]: 1 }                     // unresolvable
  private readObject<Value>(node: Node, readValue: (node: Node) => Value): Record<string, Value> {
    const object = this.followConst(node);
    if (!Node.isObjectLiteralExpression(object)) {
      throw new UnresolvedNodeError(object);
    }
    // No prototype, so every key, `__proto__` included, is an own key.
    const valueByKey = Object.create(null) as Record<string, Value>;
    for (const property of object.getProperties()) {
      if (Node.isShorthandPropertyAssignment(property)) {
        valueByKey[property.getName()] = readValue(property.getNameNode());
        continue;
      }
      const initializer = Node.isPropertyAssignment(property)
        ? property.getInitializer()
        : undefined;
      if (!Node.isPropertyAssignment(property) || initializer === undefined) {
        throw new UnresolvedNodeError(property);
      }
      const nameNode = property.getNameNode();
      const key = this.readPropertyKey(nameNode);
      if (key === '__proto__' && !Node.isComputedPropertyName(nameNode)) {
        continue;
      }
      valueByKey[key] = readValue(initializer);
    }
    return valueByKey;
  }

  // A property's name as a key: `name`, `'e-mail'`, `1`, `['e-mail']`.
  private readPropertyKey(nameNode: Node): string {
    if (Node.isIdentifier(nameNode)) {
      return nameNode.getText();
    }
    if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
      return String(nameNode.getLiteralValue());
    }
    if (Node.isComputedPropertyName(nameNode)) {
      const key = this.readStaticValue(nameNode.getExpression());
      if (typeof key === 'string' || typeof key === 'number') {
        return String(key);
      }
    }
    throw new UnresolvedNodeError(nameNode);
  }

  // `node` with parentheses, `as const` and an identifier naming a top-level
  // `const` of this file seen through. Any other identifier (an import, a
  // `let`, a parameter) is unresolvable.
  private followConst(node: Node): Node {
    if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node)) {
      return this.followConst(node.getExpression());
    }
    if (!Node.isIdentifier(node)) {
      return node;
    }
    const name = node.getText();
    const declaration = this.module.moduleFile.getVariableDeclaration(name);
    const initializer = declaration?.getInitializer();
    if (
      initializer === undefined ||
      declaration?.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const ||
      this.followedConstNames.has(name)
    ) {
      throw new UnresolvedNodeError(node);
    }
    this.followedConstNames.add(name);
    try {
      return this.followConst(initializer);
    } finally {
      this.followedConstNames.delete(name);
    }
  }
}
