// Recognising PVL in a module's syntax: the Local Names `pvl` is imported
// under, `pvl.compile(...)` markers and what is chained onto them, and a
// `pvl.<factory>(…)` call chain split into its links, and which of a module's
// exports are Schemas. Built on GenericAst.
import {
  Node,
  VariableDeclarationKind,
  type CallExpression,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';
import {
  BaseException,
  UnknownPvlMethodException,
  UnresolvedNodeException,
} from '../exceptions/index.js';
import {
  GenericAst,
  type FollowedConsts,
  type PropertyAccessCallExpression,
} from './genericAst.js';
import type { CallChain, PvlFactoryCall } from './types.js';
import { PVL_OBJECT_PROPERTY_NAMES_ENUM, PVL_SCHEMA_PROPERTY_NAMES_ENUM } from '@pvl/schema';
import type { CompileMarkerAllowedPropertyName } from './enums.js';
import { COMPILE_MARKER_ALLOWED_PROPERTY_NAMES, PVL_PACKAGE_SPECIFIER } from './consts.js';
import { isPvlObjectPropertyName, isPvlSchemaMethodName } from './utils.js';

/**
 * Static helpers that recognise PVL in ts-morph nodes. Like GenericAst's,
 * `is…`/`as…`/`find…` methods never throw, and `read…` methods throw
 * UnresolvedNodeException, ConstCycleException or
 * UnknownPvlMethodException. A method name they hand on is narrowed to the
 * one `@pvl/schema` gives it (ADR-0038).
 */
export class PvlAst {
  /**
   * The Local Names `pvl` is imported under in `sourceFile`: one per named
   * import whose Module Specifier is `@pvl/schema` and whose Import Name is
   * `pvl`. An empty set means the module has no `pvl` to read.
   *
   * ```ts
   * import { pvl } from '@pvl/schema';              // {'pvl'}
   * import { pvl as p } from '@pvl/schema';         // {'p'}
   * import { pvl as p, pvl } from '@pvl/schema';    // {'p', 'pvl'}
   * import { pvl } from './my-pvl.js';              // {}: Module Specifier isn't `@pvl/schema`
   * import { z } from '@pvl/schema';                // {}: Import Name isn't `pvl`
   * import * as schema from '@pvl/schema';          // {}: not a named import
   * ```
   */
  public static findPvlImportLocalNames(sourceFile: SourceFile): Set<string> {
    return new Set(
      sourceFile
        .getImportDeclarations()
        .filter((declaration) => declaration.getModuleSpecifierValue() === PVL_PACKAGE_SPECIFIER)
        .flatMap((declaration) => declaration.getNamedImports())
        .filter((namedImport) => namedImport.getName() === 'pvl')
        .map((namedImport) => namedImport.getAliasNode()?.getText() ?? namedImport.getName()),
    );
  }

  /**
   * Whether `node` is `<pvl>.<methodName>(…)` called directly on `<pvl>`, one
   * of `pvlImportLocalNames`, rather than another shape, such as a method
   * chained onto a Schema.
   *
   * ```ts
   * // pvlImportLocalNames: {'pvl'}
   * PvlAst.isDirectPvlCall(<pvl.string()>, names)          // true
   * PvlAst.isDirectPvlCall(<pvl.string().min(3)>, names)   // false: called on a Schema, not on `pvl`
   * PvlAst.isDirectPvlCall(<schemas.compile(x)>, names)    // false: `schemas` isn't a Local Name of `pvl`
   * ```
   */
  public static isDirectPvlCall(
    node: Node,
    pvlImportLocalNames: ReadonlySet<string>,
  ): node is PropertyAccessCallExpression {
    if (!GenericAst.isPropertyAccessCall(node)) {
      return false;
    }
    const receiver = node.getExpression().getExpression();
    return Node.isIdentifier(receiver) && pvlImportLocalNames.has(receiver.getText());
  }

  /**
   * `node` split into the call and its method name when it is a direct `pvl`
   * call (`isDirectPvlCall`) of a method `@pvl/schema`'s `pvl` has, the name
   * narrowed to it; `undefined` for any other shape or name.
   *
   * ```ts
   * // pvlImportLocalNames: {'pvl'}
   * PvlAst.asDirectPvlCall(<pvl.string()>, names)          // { call, methodName: 'string' }
   * PvlAst.asDirectPvlCall(<pvl.compile(user)>, names)     // { call, methodName: 'compile' }
   * PvlAst.asDirectPvlCall(<pvl.string().min(3)>, names)   // undefined: called on a Schema, not on `pvl`
   * PvlAst.asDirectPvlCall(<pvl.foo()>, names)             // undefined: `pvl` has no `foo`
   * ```
   */
  public static asDirectPvlCall(
    node: Node,
    pvlImportLocalNames: ReadonlySet<string>,
  ): Omit<PvlFactoryCall, 'followed'> | undefined {
    if (!PvlAst.isDirectPvlCall(node, pvlImportLocalNames)) {
      return undefined;
    }
    const methodName = node.getExpression().getName();
    return isPvlObjectPropertyName(methodName) ? { call: node, methodName } : undefined;
  }

  /**
   * The `pvl.compile(...)` calls in `sourceFile` as an array of their syntax
   * nodes (`CallExpression`), wherever they are nested, in source order. Each
   * node is the whole call, not the Schema inside it, so a caller can both read
   * its argument and replace the call. A call counts when it is
   * `<name>.compile(…)` and `<name>` is one of `pvlImportLocalNames`, the Local
   * Names `pvl` is imported under. A nested call follows the call around it.
   * Empty when no call matches or the module imports no `pvl`.
   *
   * ```ts
   * // pvlImportLocalNames: {'pvl'}
   * pvl.compile(pvl.string())     // [pvl.compile(pvl.string()) ]
   * export const user = pvl.compile(userSchema); // [pvl.compile(...)], at any depth
   * pvl.compile(pvl.compile(x))   // [outer call, inner call]
   * pvl.string()                  // []: not `compile`
   * schemas.compile(pvl.string()) // []: `schemas` isn't a Local Name of `pvl`
   * pvl.compile                   // []: not called
   *
   * // pvlImportLocalNames: {}
   * pvl.compile(pvl.string())     // []: the module imports no `pvl`
   * ```
   */
  public static findCompileCalls(
    sourceFile: SourceFile,
    pvlImportLocalNames: ReadonlySet<string>,
  ): CallExpression[] {
    // Without a `pvl` import there is nothing to find, so skip the walk.
    if (pvlImportLocalNames.size === 0) {
      return [];
    }

    // `getDescendants()` is every node of the file's syntax tree, not just
    // statements: each statement, expression, identifier and token, at any
    // depth, parents before their children, so in source order.
    return sourceFile
      .getDescendants()
      .flatMap((node) => PvlAst.asDirectPvlCall(node, pvlImportLocalNames) ?? [])
      .filter(({ methodName }) => methodName === PVL_OBJECT_PROPERTY_NAMES_ENUM.COMPILE)
      .map(({ call }) => call);
  }

  /**
   * The name of the member read off the result of the `pvl.compile(...)` call
   * `call`, when a Compiled Schema doesn't have it, so the module chains a
   * Modifier, a Constraint or an unknown property onto it. `undefined` when
   * nothing is read off the result, or only `validate`.
   *
   * - Used for checking (there cannot be any modifier after `pvl.compile()`)
   *
   * ```ts
   * pvl.compile(user).optional()      // 'optional' - not allowed
   * pvl.compile(tags).min(1)          // 'min' - not allowed
   * pvl.compile(user).strict          // 'strict': read, even when not called
   * pvl.compile(user).validate(input) // undefined: a Compiled Schema has it
   * pvl.compile(user).standalone()    // undefined: a Compiled Schema has it
   * pvl.compile(user).shape           // undefined: a compiled object has it
   * pvl.compile(user)                 // undefined: nothing read off it
   * pvl.compile(user)['optional']()   // undefined: an element access isn't checked
   * ```
   */
  public static findModifierOnCompileMarker(call: CallExpression): string | undefined {
    const parent = call.getParent();

    return Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === call &&
      !COMPILE_MARKER_ALLOWED_PROPERTY_NAMES.has(
        parent.getName() as CompileMarkerAllowedPropertyName,
      )
      ? parent.getName()
      : undefined;
  }

  /**
   * The call chain `expression` holds, read from the outside in and
   * following `const`s, into another file too: `<receiver>.<methodName>(…)`
   * is the factory when `receiver` is `pvl` under a Local Name of the file
   * it is written in, and otherwise a method chained onto the receiver's
   * chain. Each method name is narrowed to the one `@pvl/schema` gives it,
   * `pvl`'s for the factory and a Schema's for a chained method, and one it
   * doesn't have throws UnknownPvlMethodException at its call. A chained
   * method's name is checked only once its receiver is read, so a receiver
   * that can't be read is what is reported.
   *
   * ```ts
   * // import { pvl } from '@pvl/schema';
   * PvlAst.readCallChain(<pvl.string().min(3)>) // { factory: string(), methods: [min(3)] }
   * PvlAst.readCallChain(<user>)                // the chain `const user = …` holds, imported or not
   * PvlAst.readCallChain(<makeSchema()>)        // throws UnresolvedNodeException
   * PvlAst.readCallChain(<schemas.user>)        // throws UnresolvedNodeException, with a hint when `schemas` is a namespace import
   * PvlAst.readCallChain(<z.string()>)          // throws UnresolvedNodeException at <z>
   * PvlAst.readCallChain(<pvl.foo()>)           // throws UnknownPvlMethodException at <pvl.foo()>
   * PvlAst.readCallChain(<pvl.string().foo()>)  // throws UnknownPvlMethodException at <….foo()>
   * PvlAst.readCallChain(<z.string().foo()>)    // throws UnresolvedNodeException at <z>: the receiver is read first
   * ```
   */
  public static readCallChain(expression: Node, followed: FollowedConsts = new Set()): CallChain {
    const { node, followed: reading } = GenericAst.followConst(expression, followed);
    // A followed import leaves `node` in another file, which may import `pvl` under other names.
    const pvlImportLocalNames = PvlAst.findPvlImportLocalNames(node.getSourceFile());
    const directPvlCall = PvlAst.asDirectPvlCall(node, pvlImportLocalNames);

    if (directPvlCall !== undefined) {
      return { factory: { ...directPvlCall, followed: reading }, methods: [] };
    }
    if (PvlAst.isDirectPvlCall(node, pvlImportLocalNames)) {
      throw new UnknownPvlMethodException(node);
    }

    const propertyAccessCall = GenericAst.asPropertyAccessCall(node);
    if (propertyAccessCall === undefined) {
      throw new UnresolvedNodeException(node, GenericAst.findImportHint(node));
    }

    const { call, receiver, methodName } = propertyAccessCall;
    const chain = PvlAst.readCallChain(receiver, reading);
    if (!isPvlSchemaMethodName(methodName)) {
      throw new UnknownPvlMethodException(call);
    }
    return { ...chain, methods: [...chain.methods, { call, methodName }] };
  }

  /**
   * The argument of `link`, a factory call, which every factory but the
   * primitives needs. Throws an UnresolvedNodeException at the call when
   * there is none.
   *
   * ```ts
   * PvlAst.readArgument(<pvl.array(pvl.string())>) // <pvl.string()>
   * PvlAst.readArgument(<pvl.array()>)             // throws UnresolvedNodeException(<pvl.array()>)
   * ```
   */
  public static readArgument({ call }: PvlFactoryCall): Node {
    const [argument] = call.getArguments();
    if (argument === undefined) {
      throw new UnresolvedNodeException(call);
    }
    return argument;
  }

  /**
   * The names of `sourceFile`'s exported Schemas, in declaration order: each
   * `export const` whose value is a `pvl.*` call chain, read statically,
   * following `const`s, imported ones too, marked to compile or not. A
   * function or a `.validate()` result is no Schema here.
   *
   * ```ts
   * const name = pvl.string();
   * export const user = pvl.object({ name });
   * export const optionalName = name.optional();
   * export const getUser = () => pvl.object({ name });
   * PvlAst.findExportedSchemaNames(sourceFile) // ['user', 'optionalName']
   * ```
   */
  public static findExportedSchemaNames(sourceFile: SourceFile): string[] {
    return sourceFile
      .getVariableStatements()
      .filter(
        (statement) =>
          statement.isExported() &&
          statement.getDeclarationKind() === VariableDeclarationKind.Const,
      )
      .flatMap((statement) => statement.getDeclarations())
      .filter((declaration) => PvlAst.holdsSchema(declaration))
      .map((declaration) => declaration.getName());
  }

  /**
   * Whether `declaration` binds one name to a Schema: every `pvl.*` method
   * returns one, so any chain that ends in no `.validate()` does. A chain
   * calling a method `@pvl/schema` doesn't have returns nothing known.
   *
   * ```ts
   * const user = pvl.object({ … });      // true
   * const user = base.optional();        // true, with `const base = pvl.string()`, imported or not
   * const result = user.validate(input); // false: a Result
   * const getUser = () => pvl.string();  // false: a function
   * const { shape } = user;              // false: destructuring
   * const name = pvl.string().foo();     // false: `@pvl/schema` has no `foo`
   * ```
   */
  private static holdsSchema(declaration: VariableDeclaration): boolean {
    const initializer = declaration.getInitializer();
    if (initializer === undefined || !Node.isIdentifier(declaration.getNameNode())) {
      return false;
    }
    try {
      return PvlAst.readCallChain(initializer).methods.every(
        ({ methodName }) => methodName !== PVL_SCHEMA_PROPERTY_NAMES_ENUM.VALIDATE,
      );
    } catch (error) {
      if (error instanceof BaseException) {
        return false;
      }
      throw error;
    }
  }
}
