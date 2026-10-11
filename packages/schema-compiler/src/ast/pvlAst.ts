// Recognising PVL in a module's syntax: the Local Names `pvl` is imported
// under, `pvl.compile(...)` markers and what is chained onto them, and a
// `pvl.<factory>(…)` call chain split into its links. Built on GenericAst.
import { Node, type CallExpression, type SourceFile } from 'ts-morph';
import { GenericAst, type FollowedConsts, type PropertyAccessCall } from './genericAst.js';
import { UnresolvedNodeError } from './unresolvedNodeError.js';

/** The package `pvl` is imported from. */
const PVL_PACKAGE = '@pvl/schema' as const;

/** The methods that may still be read off the result of `pvl.compile(...)`. Anything else read off it is a Modifier, a Constraint or a property a Compiled Schema doesn't have, reported as COMPILE_RESULT_MODIFIED. */
const COMPILE_MARKER_ALLOWED_METHODS: ReadonlySet<string> = new Set(['validate']);

/** One call in a call chain, with the `const`s followed to reach it, which reading its arguments carries on. */
export type CallChainLink = Omit<PropertyAccessCall, 'receiver'> & {
  followed: FollowedConsts;
};

/**
 * A `pvl.<factory>(…)` call and the methods chained onto it.
 *
 * ```ts
 * pvl.string().min(3).max(5)
 * // { factory: <pvl.string()>, methods: [<….min(3)>, <….max(5)>] }
 * ```
 */
export type CallChain = {
  /** The call of `pvl` itself: `pvl.string()`, or `pvl.compile(…)`. */
  factory: CallChainLink;
  /** The methods chained onto it, in chain order. */
  methods: ReadonlyArray<CallChainLink>;
};

/**
 * Static helpers that recognise PVL in ts-morph nodes. Like GenericAst's,
 * `is…`/`as…`/`find…` methods never throw, and `read…` methods throw
 * UnresolvedNodeError or ConstCycleError.
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
        .filter((declaration) => declaration.getModuleSpecifierValue() === PVL_PACKAGE)
        .flatMap((declaration) => declaration.getNamedImports())
        .filter((namedImport) => namedImport.getName() === 'pvl')
        .map((namedImport) => namedImport.getAliasNode()?.getText() ?? namedImport.getName()),
    );
  }

  /**
   * `node` as `<pvl>.<name>(…)`, where `<pvl>` is one of `pvlImportLocalNames`,
   * or `undefined` when it is another shape.
   *
   * ```ts
   * // pvlImportLocalNames: {'pvl'}
   * PvlAst.asPvlCall(<pvl.string()>, names)          // { call, methodName: 'string' }
   * PvlAst.asPvlCall(<pvl.string().min(3)>, names)   // undefined: called on a Schema, not on `pvl`
   * PvlAst.asPvlCall(<schemas.compile(x)>, names)    // undefined: `schemas` isn't a Local Name of `pvl`
   * ```
   */
  public static asPvlCall(
    node: Node,
    pvlImportLocalNames: ReadonlySet<string>,
  ): Omit<PropertyAccessCall, 'receiver'> | undefined {
    const propertyAccessCall = GenericAst.asPropertyAccessCall(node);
    if (propertyAccessCall === undefined) {
      return undefined;
    }
    const { call, receiver, methodName } = propertyAccessCall;
    return Node.isIdentifier(receiver) && pvlImportLocalNames.has(receiver.getText())
      ? { call, methodName }
      : undefined;
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
      .flatMap((node) => PvlAst.asPvlCall(node, pvlImportLocalNames) ?? [])
      .filter(({ methodName }) => methodName === 'compile')
      .map(({ call }) => call);
  }

  /**
   * The name of the member read off the result of the `pvl.compile(...)` call
   * `call`, when a Compiled Schema doesn't have it, so the module chains a
   * Modifier, a Constraint or an unknown property onto it. `undefined` when
   * nothing is read off the result, or only `validate`.
   *
   * ```ts
   * pvl.compile(user).optional()      // 'optional'
   * pvl.compile(tags).min(1)          // 'min'
   * pvl.compile(user).shape           // 'shape': read, even when not called
   * pvl.compile(user).validate(input) // undefined: a Compiled Schema has it
   * pvl.compile(user)                 // undefined: nothing read off it
   * pvl.compile(user)['optional']()   // undefined: an element access isn't checked
   * ```
   */
  public static findModifierOnCompileMarker(call: CallExpression): string | undefined {
    const parent = call.getParent();

    return Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === call &&
      !COMPILE_MARKER_ALLOWED_METHODS.has(parent.getName())
      ? parent.getName()
      : undefined;
  }

  /**
   * The call chain `expression` holds, read from the outside in and
   * following `const`s: `<receiver>.<methodName>(…)` is the factory when `receiver`
   * is `pvl`, and otherwise a method chained onto the receiver's chain.
   *
   * ```ts
   * // pvlImportLocalNames: {'pvl'}
   * PvlAst.readCallChain(<pvl.string().min(3)>, names) // { factory: string(), methods: [min(3)] }
   * PvlAst.readCallChain(<user>, names)                // the chain `const user = …` holds
   * PvlAst.readCallChain(<makeSchema()>, names)        // throws UnresolvedNodeError
   * PvlAst.readCallChain(<z.string()>, names)          // throws UnresolvedNodeError at <z>
   * ```
   */
  public static readCallChain(
    expression: Node,
    pvlImportLocalNames: ReadonlySet<string>,
    followed: FollowedConsts = new Set(),
  ): CallChain {
    const { node, followed: reading } = GenericAst.followConst(expression, followed);
    const pvlCall = PvlAst.asPvlCall(node, pvlImportLocalNames);
    if (pvlCall !== undefined) {
      return { factory: { ...pvlCall, followed: reading }, methods: [] };
    }

    const propertyAccessCall = GenericAst.asPropertyAccessCall(node);
    if (propertyAccessCall === undefined) {
      throw new UnresolvedNodeError(node);
    }
    const { call, receiver, methodName } = propertyAccessCall;
    const chain = PvlAst.readCallChain(receiver, pvlImportLocalNames, reading);
    return { ...chain, methods: [...chain.methods, { call, methodName, followed: reading }] };
  }
}
