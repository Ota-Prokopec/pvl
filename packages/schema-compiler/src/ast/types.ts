import type { PvlSchemaModifierMethodName, PvlObjectPropertyName } from '@pvl/schema';
import type { FollowedConsts, PropertyAccessCall } from './genericAst.js';

/** A method chained in a call chain, `.min(3)`. Its arguments never follow a `const` (ADR-0030), so it carries none of the ones followed to reach it. */
export type MethodCall = Omit<PropertyAccessCall, 'receiver' | 'methodName'> & {
  methodName: PvlSchemaModifierMethodName | PvlObjectPropertyName;
};

/** A call chain's factory call, with the `const`s followed to reach it, which reading the factory's arguments carries on. */
export type MethodCallWithFollowedConsts = MethodCall & {
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
  factory: MethodCallWithFollowedConsts;
  /** The methods chained onto it, in chain order. */
  methods: ReadonlyArray<MethodCall>;
};
