// Reads a Schema expression from source into a SchemaModel, statically
// (ADR-0002): only what is written as a `pvl.*` call chain, a literal or a
// top-level `const` in the same file holding one is understood. Nothing is
// imported or executed.
import type { EnumMember, PossibleLiteralValue } from '@pvl/schema';
import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type Expression,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';
import { SCHEMA_FACTORY, type SchemaFactory } from './enums.js';
import type { ObjectField, SchemaMethodCall, SchemaModel, StaticValue } from './schemaModel.js';

// Thrown from anywhere in the walk at the first node that can't be read, and
// caught by readSchema.
class UnresolvedNodeError extends Error {
  public readonly unresolvedNode: Node;

  public constructor(unresolvedNode: Node) {
    super(`Can't read ${unresolvedNode.getText()} statically.`);
    this.unresolvedNode = unresolvedNode;
  }
}

const SCHEMA_FACTORIES: ReadonlySet<string> = new Set(Object.values(SCHEMA_FACTORY));

// Whether `name` is a `pvl.*` factory the compiler reads.
//
//   isSchemaFactory('object')  // true
//   isSchemaFactory('compile') // false
const isSchemaFactory = (name: string): name is SchemaFactory => SCHEMA_FACTORIES.has(name);

// Whether a literal value can be an enum member.
//
//   isEnumMember('A') // true
//   isEnumMember(1)   // true
//   isEnumMember(1n)  // false
const isEnumMember = (value: StaticValue): value is EnumMember =>
  typeof value === 'string' || typeof value === 'number';

class SchemaReader {
  private readonly sourceFile: SourceFile;
  private readonly pvlImportLocalNames: ReadonlySet<string>;
  // The `const`s being followed, so a cycle (`const a = b; const b = a;`)
  // is unresolvable rather than endless.
  private readonly followedConstNames = new Set<string>();

  public constructor({ sourceFile, pvlImportLocalNames }: Omit<ReadSchemaArgs, 'expression'>) {
    this.sourceFile = sourceFile;
    this.pvlImportLocalNames = pvlImportLocalNames;
  }

  /**
   * `expression` as a Schema: a `pvl.*` factory call with methods chained
   * onto it, or a `const` holding one. Reads the chain from the outside in:
   *
   * 1. Sees through parentheses, `as const` and a top-level `const`.
   * 2. Requires a call on a property access, `<receiver>.<name>(…)`.
   * 3. If the receiver is `pvl`, the call is the factory and the chain's
   *    start: `readFactoryCall` reads it.
   * 4. Otherwise `<name>` is a method: reads the receiver as a Schema the
   *    same way, then appends the method call to its `calls`, with its
   *    arguments as literals, or `undefined` when one isn't.
   *
   * ```ts
   * pvl.string().min(3)       // { factory: 'string', calls: [min(3)] }
   * pvl.string().refine(isOk) // { factory: 'string', calls: [refine(args: undefined)] }
   * user                      // what `const user = …` holds
   * pvl.compile(pvl.string()) // { factory: 'string' }: compile() is identity
   * makeSchema()              // unresolvable: not a property access
   * z.string()                // unresolvable: `z` is no `pvl` name nor a local const
   * ```
   */
  // `expression` is the source node to read, as written: `pvl.string().min(3)`,
  // `user`, `(pvl.string())`. It may still be an identifier or wrapped.
  public readSchemaExpression(expression: Node): SchemaModel {
    // `node` is `expression` with the wrapping seen through: the identifier
    // replaced by its `const` initializer, parentheses and `as const` dropped.
    // `const user = pvl.string()` makes `user` read as `pvl.string()`.
    const node = this.followConst(expression);
    if (!Node.isCallExpression(node)) {
      throw new UnresolvedNodeError(node);
    }

    // `callee` is what `node` calls, the part before the parentheses. For
    // `pvl.string().min(3)` it is `pvl.string().min`. It must be a property
    // access, `<receiver>.<name>`; a bare `makeSchema()` is unresolvable.
    const callee = node.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) {
      throw new UnresolvedNodeError(node);
    }

    // `name` is the property the call goes through, the last segment of
    // `callee`: `min` for `pvl.string().min(3)`, `string` for `pvl.string()`.
    const name = callee.getName();
    // `receiver` is what `name` is read from, the part before the last dot:
    // `pvl.string()` for `pvl.string().min(3)`, `pvl` for `pvl.string()`. It is
    // either the `pvl` import, which makes the call a factory, or an earlier
    // link of the chain, which is a Schema itself.
    const receiver = callee.getExpression();

    if (Node.isIdentifier(receiver) && this.pvlImportLocalNames.has(receiver.getText())) {
      return this.readFactoryCall(name, node.getArguments(), node);
    }

    const schema = this.readSchemaExpression(receiver);
    const call: SchemaMethodCall = {
      name,
      args: this.tryReadStaticArguments(node.getArguments()),
      line: node.getStartLineNumber(),
    };
    return { ...schema, calls: [...schema.calls, call] };
  }

  /**
   * `pvl.<name>(...args)` as a Schema with nothing chained onto it yet. Each
   * factory reads its first argument its own way; `compile` reads through to
   * its argument, and a name that is no factory is unresolvable.
   *
   * ```ts
   * pvl.string()                            // { factory: 'string', calls: [] }
   * pvl.literal('a')                        // { factory: 'literal', literalValue: 'a', … }
   * pvl.enum(['A', 'B'])                    // { factory: 'enum', members: ['A', 'B'], … }
   * pvl.object({ name: pvl.string() })      // { factory: 'object', shape: [{ key: 'name', … }], … }
   * pvl.array(pvl.number())                 // { factory: 'array', element: { factory: 'number', … }, … }
   * pvl.union([pvl.string(), pvl.number()]) // { factory: 'union', members: [string, number], … }
   * pvl.compile(pvl.string())               // { factory: 'string', calls: [] }: the argument's Schema
   * pvl.compile()                           // unresolvable: nothing to read through to
   * pvl.literal()                           // unresolvable: the required argument is missing
   * pvl.union(members)                      // unresolvable unless `members` is an array literal
   * ```
   */
  private readFactoryCall(name: string, args: ReadonlyArray<Node>, call: Node): SchemaModel {
    const line = call.getStartLineNumber();
    const [firstArgument] = args;
    if (name === 'compile' && firstArgument !== undefined) {
      return this.readSchemaExpression(firstArgument);
    }
    if (!isSchemaFactory(name)) {
      throw new UnresolvedNodeError(call);
    }
    switch (name) {
      case SCHEMA_FACTORY.STRING:
      case SCHEMA_FACTORY.NUMBER:
      case SCHEMA_FACTORY.BOOLEAN:
      case SCHEMA_FACTORY.BIGINT:
        return { factory: name, calls: [], line };
      case SCHEMA_FACTORY.LITERAL:
        return {
          factory: name,
          literalValue: this.readLiteralValue(this.requireArgument(firstArgument, call)),
          calls: [],
          line,
        };
      case SCHEMA_FACTORY.ENUM:
        return {
          factory: name,
          members: this.readEnumMembers(this.requireArgument(firstArgument, call)),
          calls: [],
          line,
        };
      case SCHEMA_FACTORY.OBJECT:
        return {
          factory: name,
          shape: this.readObjectShape(this.requireArgument(firstArgument, call)),
          calls: [],
          line,
        };
      case SCHEMA_FACTORY.ARRAY:
        return {
          factory: name,
          element: this.readSchemaExpression(this.requireArgument(firstArgument, call)),
          calls: [],
          line,
        };
      case SCHEMA_FACTORY.UNION: {
        const members = this.followConst(this.requireArgument(firstArgument, call));
        if (!Node.isArrayLiteralExpression(members)) {
          throw new UnresolvedNodeError(members);
        }
        return {
          factory: name,
          members: members.getElements().map((member) => this.readSchemaExpression(member)),
          calls: [],
          line,
        };
      }
    }
  }

  // `pvl.object()`'s argument, field by field, in the order the object's
  // own keys take at runtime, which is the order `ObjectSchema` checks them
  // in: integer-like keys first, ascending, then the rest as written. A key
  // written twice keeps its first place and its last Schema.
  //
  //   { name: pvl.string(), 'e-mail': email, age } // three fields
  //   { b: pvl.string(), 1: pvl.number() }          // '1', then 'b'
  //   { ['__proto__']: pvl.string() }               // one field, `__proto__`
  //   { __proto__: pvl.string() }                   // none: it sets the prototype
  //   { ...base }                                   // unresolvable
  private readObjectShape(argument: Node): ObjectField[] {
    const shape = this.followConst(argument);
    if (!Node.isObjectLiteralExpression(shape)) {
      throw new UnresolvedNodeError(shape);
    }
    // No prototype, so every key, `__proto__` included, is an own key.
    const schemaByKey: Record<string, SchemaModel> = Object.create(null) as Record<
      string,
      SchemaModel
    >;
    for (const property of this.findOwnProperties(shape)) {
      if (Node.isShorthandPropertyAssignment(property)) {
        schemaByKey[property.getName()] = this.readSchemaExpression(property.getNameNode());
        continue;
      }
      if (!Node.isPropertyAssignment(property)) {
        throw new UnresolvedNodeError(property);
      }
      const initializer = property.getInitializer();
      if (initializer === undefined) {
        throw new UnresolvedNodeError(property);
      }
      schemaByKey[this.readPropertyKey(property.getNameNode())] =
        this.readSchemaExpression(initializer);
    }
    return Object.entries(schemaByKey).map(([key, schema]) => ({ key, schema }));
  }

  // `pvl.enum()`'s argument: a string array, or an object of strings and
  // numbers, whose values are the members, each once.
  //
  //   ['A', 'B', 'A']  // ['A', 'B']
  //   { A: 'a', B: 1 } // ['a', 1]
  private readEnumMembers(argument: Node): EnumMember[] {
    const source = this.readStaticValue(argument);
    const members: ReadonlyArray<StaticValue> = Array.isArray(source)
      ? source
      : typeof source === 'object'
        ? Object.values(source)
        : [];
    const enumMembers = members.filter(isEnumMember);
    if (enumMembers.length === 0 || enumMembers.length !== members.length) {
      throw new UnresolvedNodeError(argument);
    }
    // Each member once, as `EnumSchema` keeps them in a Set.
    return [...new Set(enumMembers)];
  }

  // `pvl.literal()`'s argument.
  private readLiteralValue(argument: Node): PossibleLiteralValue {
    const literalValue = this.readStaticValue(argument);
    if (typeof literalValue === 'object') {
      throw new UnresolvedNodeError(argument);
    }
    return literalValue;
  }

  // A method's arguments, or `undefined` when one isn't a literal:
  //
  //   .min(3, { message: 'too short' }) // [3, { message: 'too short' }]
  //   .refine((value) => value > 0)     // undefined
  private tryReadStaticArguments(args: ReadonlyArray<Node>): StaticValue[] | undefined {
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
    if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) {
      return value.getLiteralValue();
    }
    if (Node.isNumericLiteral(value)) {
      return value.getLiteralValue();
    }
    if (Node.isBigIntLiteral(value)) {
      return value.getLiteralValue() as bigint;
    }
    if (Node.isTrueLiteral(value) || Node.isFalseLiteral(value)) {
      return value.getLiteralValue();
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
      return Object.fromEntries(
        this.findOwnProperties(value).map((property) => {
          if (!Node.isPropertyAssignment(property)) {
            throw new UnresolvedNodeError(property);
          }
          const initializer = property.getInitializer();
          if (initializer === undefined) {
            throw new UnresolvedNodeError(property);
          }
          return [this.readPropertyKey(property.getNameNode()), this.readStaticValue(initializer)];
        }),
      );
    }
    throw new UnresolvedNodeError(value);
  }

  // The properties of an object literal that become its own keys: all of
  // them but a plain `__proto__: …`, which sets the object's prototype
  // instead, so `Object.keys` never lists it.
  private findOwnProperties(objectLiteral: ObjectLiteralExpression): Node[] {
    return objectLiteral
      .getProperties()
      .filter(
        (property) =>
          !Node.isPropertyAssignment(property) ||
          Node.isComputedPropertyName(property.getNameNode()) ||
          this.readPropertyKey(property.getNameNode()) !== '__proto__',
      );
  }

  // A property's name as a key: `name`, `'e-mail'`, `1`, `['e-mail']`. Any
  // other computed one (`[key]`) is unresolvable.
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

  // `node` with parentheses, `as const` and identifiers naming a top-level
  // `const` of this file seen through, so `const user = pvl.object(…)`
  // reads as its initializer. An identifier naming anything else (an
  // import, a `let`, a parameter) is unresolvable.
  private followConst(node: Node): Node {
    if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node)) {
      return this.followConst(node.getExpression());
    }
    if (!Node.isIdentifier(node)) {
      return node;
    }
    const name = node.getText();
    const declaration = this.sourceFile.getVariableDeclaration(name);
    const initializer = declaration?.getInitializer();
    if (
      declaration === undefined ||
      initializer === undefined ||
      declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const ||
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

  // A factory's required argument, or unresolvable when it is missing.
  private requireArgument(argument: Node | undefined, call: Node): Node {
    if (argument === undefined) {
      throw new UnresolvedNodeError(call);
    }
    return argument;
  }
}

/** The pvl.compile() argument a SchemaModel is read from, and where it is written. */
export type ReadSchemaArgs = {
  expression: Expression;
  sourceFile: SourceFile;
  /** The Local Names `pvl` is imported under from `@pvl/schema`. */
  pvlImportLocalNames: ReadonlySet<string>;
};

/**
 * Reads `expression` into a SchemaModel, or reports the first node that
 * can't be read statically.
 *
 * ```ts
 * // const MIN = 3;
 * // const user = pvl.object({ name: pvl.string().min(MIN) });
 * readSchema({ expression: <user>, … })
 * // { schema: { factory: 'object', shape: [{ key: 'name', schema: { factory: 'string', calls: [min(3)] } }] } }
 * readSchema({ expression: <importedUser>, … }) // { unresolvedNode: <importedUser> }
 * ```
 */
export const readSchema = ({
  expression,
  ...readerOptions
}: ReadSchemaArgs): { schema: SchemaModel } | { unresolvedNode: Node } => {
  try {
    return { schema: new SchemaReader(readerOptions).readSchemaExpression(expression) };
  } catch (error) {
    if (error instanceof UnresolvedNodeError) {
      return { unresolvedNode: error.unresolvedNode };
    }
    throw error;
  }
};
