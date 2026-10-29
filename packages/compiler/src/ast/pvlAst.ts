// Recognising PVL in a module's syntax: a name bound to `pvl` imported from
// `@pcvl/schema`, `pvl.compile(...)` markers and what is chained onto them,
// and a `pvl.<factory>(…)` call chain split into its links. Built on GenericAst.
import { Node, type CallExpression, type Identifier, type SourceFile } from 'ts-morph';
import { UnknownPvlMethodException, UnresolvedNodeException } from '../exceptions/index.js';
import {
  GenericAst,
  type FollowedConsts,
  type PropertyAccessCallExpression,
} from './genericAst.js';
import type { CallChain, PvlFactoryCall } from './types.js';
import { PVL_OBJECT_PROPERTY_NAMES_ENUM } from '@pcvl/schema';
import type { CompileMarkerAllowedPropertyName } from './enums.js';
import { COMPILE_MARKER_ALLOWED_PROPERTY_NAMES, PVL_PACKAGE_SPECIFIER } from './consts.js';
import { isPvlObjectPropertyName, isPvlSchemaMethodName } from './utils.js';

/**
 * Static helpers that recognise PVL in ts-morph nodes. Like GenericAst's,
 * `is…`/`as…`/`find…` methods never throw, and `read…` methods throw
 * UnresolvedNodeException, ConstCycleException or
 * UnknownPvlMethodException. A method name they hand on is narrowed to the
 * one `@pcvl/schema` gives it (ADR-0038).
 */
export class PvlAst {
  /**
   * Whether `node` is `<pvl>.<methodName>(…)` called directly on a name
   * bound to `pvl` (`isPvlImport`), rather than another shape, such as a
   * method chained onto a Schema.
   *
   * ```ts
   * // import { pvl } from '@pcvl/schema';
   * PvlAst.isDirectPvlCall(<pvl.string()>)          // true
   * PvlAst.isDirectPvlCall(<pvl.string().min(3)>)   // false: called on a Schema, not on `pvl`
   * PvlAst.isDirectPvlCall(<schemas.compile(x)>)    // false: `schemas` isn't bound to `pvl`
   * ```
   */
  public static isDirectPvlCall(node: Node): node is PropertyAccessCallExpression {
    if (!GenericAst.isPropertyAccessCall(node)) {
      return false;
    }
    const receiver = node.getExpression().getExpression();
    return Node.isIdentifier(receiver) && PvlAst.isPvlImport(receiver);
  }

  /**
   * Whether `identifier` is bound to `pvl` imported from `@pcvl/schema`: to a
   * named import whose Module Specifier is `@pcvl/schema` and whose Import
   * Name is `pvl`, under any Local Name, in whichever file `identifier` is
   * written. A parameter or a local that shadows it is not it.
   *
   * ```ts
   * // import { pvl as p } from '@pcvl/schema';
   * PvlAst.isPvlImport(<p>)   // true
   * // import { pvl } from './my-pvl.js';
   * PvlAst.isPvlImport(<pvl>) // false: Module Specifier isn't `@pcvl/schema`
   * // import { z } from '@pcvl/schema';
   * PvlAst.isPvlImport(<z>)   // false: Import Name isn't `pvl`
   * // import * as schema from '@pcvl/schema';
   * PvlAst.isPvlImport(<schema>) // false: not a named import
   * // import { pvl } from '@pcvl/schema'; (pvl: Factory) => pvl.string()
   * PvlAst.isPvlImport(<pvl>) // false, in the arrow function: the parameter
   * ```
   */
  private static isPvlImport(identifier: Identifier): boolean {
    const declaration = GenericAst.findLocalDeclaration(identifier);
    return (
      Node.isImportSpecifier(declaration) &&
      declaration.getName() === 'pvl' &&
      declaration.getImportDeclaration().getModuleSpecifierValue() === PVL_PACKAGE_SPECIFIER
    );
  }

  /**
   * `node` split into the call and its method name when it is a direct `pvl`
   * call (`isDirectPvlCall`) of a method `@pcvl/schema`'s `pvl` has, the name
   * narrowed to it; `undefined` for any other shape or name.
   *
   * ```ts
   * // import { pvl } from '@pcvl/schema';
   * PvlAst.asDirectPvlCall(<pvl.string()>)          // { call, methodName: 'string' }
   * PvlAst.asDirectPvlCall(<pvl.compile(user)>)     // { call, methodName: 'compile' }
   * PvlAst.asDirectPvlCall(<pvl.string().min(3)>)   // undefined: called on a Schema, not on `pvl`
   * PvlAst.asDirectPvlCall(<pvl.foo()>)             // undefined: `pvl` has no `foo`
   * ```
   */
  public static asDirectPvlCall(node: Node): Omit<PvlFactoryCall, 'followed'> | undefined {
    if (!PvlAst.isDirectPvlCall(node)) {
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
   * `<name>.compile(…)` and `<name>` is bound to `pvl` (`isPvlImport`). A
   * nested call follows the call around it. Empty when no call matches or the
   * module imports nothing from `@pcvl/schema`.
   *
   * ```ts
   * // import { pvl } from '@pcvl/schema';
   * pvl.compile(pvl.string())     // [pvl.compile(pvl.string()) ]
   * export const user = pvl.compile(userSchema); // [pvl.compile(...)], at any depth
   * pvl.compile(pvl.compile(x))   // [outer call, inner call]
   * pvl.string()                  // []: not `compile`
   * schemas.compile(pvl.string()) // []: `schemas` isn't bound to `pvl`
   * pvl.compile                   // []: not called
   *
   * // no import from '@pcvl/schema'
   * pvl.compile(pvl.string())     // []: the module imports no `pvl`
   * ```
   */
  public static findCompileCalls(sourceFile: SourceFile): CallExpression[] {
    // Without a `@pcvl/schema` import there is nothing to find, so skip the walk.
    if (sourceFile.getImportDeclaration(PVL_PACKAGE_SPECIFIER) === undefined) {
      return [];
    }

    // `getDescendants()` is every node of the file's syntax tree, not just
    // statements: each statement, expression, identifier and token, at any
    // depth, parents before their children, so in source order.
    return sourceFile
      .getDescendants()
      .flatMap((node) => PvlAst.asDirectPvlCall(node) ?? [])
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
   * is the factory when `receiver` is bound to `pvl` (`isPvlImport`), in
   * whichever file, and otherwise a method chained onto the receiver's
   * chain. Each method name is narrowed to the one `@pcvl/schema` gives it,
   * `pvl`'s for the factory and a Schema's for a chained method, and one it
   * doesn't have throws UnknownPvlMethodException at its call. A chained
   * method's name is checked only once its receiver is read, so a receiver
   * that can't be read is what is reported.
   *
   * ```ts
   * // import { pvl } from '@pcvl/schema';
   * PvlAst.readCallChain(<pvl.string().min(3)>) // { factory: string(), methods: [min(3)] }
   * PvlAst.readCallChain(<user>)                // the chain `const user = …` holds, imported or not
   * PvlAst.readCallChain(<makeSchema()>)        // throws UnresolvedNodeException
   * PvlAst.readCallChain(<schemas.user>)        // throws UnresolvedNodeException at <schemas.user>: a property read
   * PvlAst.readCallChain(<z.string()>)          // throws UnresolvedNodeException at <z>
   * PvlAst.readCallChain(<pvl.foo()>)           // throws UnknownPvlMethodException at <pvl.foo()>
   * PvlAst.readCallChain(<pvl.string().foo()>)  // throws UnknownPvlMethodException at <….foo()>
   * PvlAst.readCallChain(<z.string().foo()>)    // throws UnresolvedNodeException at <z>: the receiver is read first
   * ```
   */
  public static readCallChain(expression: Node, followed: FollowedConsts = new Set()): CallChain {
    const { node, followed: reading } = GenericAst.followConst(expression, followed);
    const directPvlCall = PvlAst.asDirectPvlCall(node);

    if (directPvlCall !== undefined) {
      return { factory: { ...directPvlCall, followed: reading }, methods: [] };
    }
    if (PvlAst.isDirectPvlCall(node)) {
      throw new UnknownPvlMethodException(node);
    }

    const propertyAccessCall = GenericAst.asPropertyAccessCall(node);
    if (propertyAccessCall === undefined) {
      throw new UnresolvedNodeException(node);
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
}
