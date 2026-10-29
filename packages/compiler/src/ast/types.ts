import type { PvlObjectPropertyName, PvlSchemaMethodName } from '@pcvl/schema';
import type { FollowedConsts, PropertyAccessCall } from './genericAst.js';

/** A call chain's factory call, `pvl.string()` or `pvl.compile(…)`, named as `@pcvl/schema` names `pvl`'s methods, with the `const`s followed to reach it, which reading the factory's arguments carries on. */
export type PvlFactoryCall = Omit<PropertyAccessCall, 'receiver' | 'methodName'> & {
  methodName: PvlObjectPropertyName;
  followed: FollowedConsts;
};

/** A method chained in a call chain, `.min(3)` or `.validate(input)`, named as `@pcvl/schema` names a Schema's methods. Its arguments never follow a `const` (ADR-0030), so it carries none of the ones followed to reach it. */
export type SchemaCall = Omit<PropertyAccessCall, 'receiver' | 'methodName'> & {
  methodName: PvlSchemaMethodName;
};

/** A property read off a namespace import: `schemas.user`, with `import * as schemas from './schemas.js'`. */
export type NamespaceImportRead = {
  /** The namespace import's Module Specifier: `'./schemas.js'`. */
  moduleSpecifierAsString: string;
  /** The property read: `'user'`. */
  propertyName: string;
};

/** The first error TypeScript's parser reports in a file: its message, flattened to one line, and the line it is on. */
export type ParseError = {
  message: string;
  line: number;
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
  factory: PvlFactoryCall;
  /** The methods chained onto it, in chain order. */
  methods: ReadonlyArray<SchemaCall>;
};
