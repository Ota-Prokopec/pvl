// What a compiler Schema is built from: the methods chained onto it, what
// every Schema holds and what each subclass holds besides, and the contract
// a subclass reads its factory's argument through.
import type { EnumMember, PossibleLiteralValue, PvlFactoryName } from '@pvl/schema';
import type { Node } from 'ts-morph';
import type { FollowedConsts, StaticValue } from '../ast/genericAst.js';
import type { PvlFactoryCall } from '../ast/types.js';
import type { Module } from '../module.js';
import type { RuntimeArgument } from '../runtimeArgument/runtimeArgument.js';
import type { Schema } from './schema.js';

/** One argument of a method chained onto a Schema: read as written, or a Runtime Argument its Compiled Schema evaluates. */
export type SchemaModifierCallArgument = StaticValue | RuntimeArgument;

/** One method chained onto a Schema: `.min(3, { message: 'too short' })`. */
export type SchemaModifierCall = {
  name: string;
  /**
   * Each argument read statically, or else a Runtime Argument;
   * `undefined` when one is spread, so it has no fixed position.
   */
  args: ReadonlyArray<SchemaModifierCallArgument> | undefined;
  /** The 1-based line it is written on. */
  line: number;
};

/** What every Schema holds, whichever factory built it. */
export type SchemaOptions = {
  /** The Module it is written in. */
  module: Module;
  /** The expression it is read from. */
  expression: Node;
  /** The 1-based line its factory call is written on. */
  line: number;
  /** The Modifiers chained onto its factory call, pre- and post-modifiers together, in chain order, its `.transform()` included, last. */
  calls: ReadonlyArray<SchemaModifierCall>;
  /** Whether `.standalone()` is chained onto it. */
  isStandalone: boolean;
};

/** What a subclass's `readFactoryArgument` reads its factory's argument with. */
export type ReadFactoryArgs = {
  /** Reads a Schema nested in this one: a field, an element or a member. */
  readNested: (expression: Node, followed: FollowedConsts) => Schema;
};

/** A Schema subclass, as `readSchema` picks one by the factory it reads. */
export type SchemaClass = {
  /** The `pvl.*` factory it reads. */
  readonly factory: PvlFactoryName;
  /**
   * Reads the argument of `link`, its factory call, and returns how its
   * Schema is built from what every Schema holds, which is read after the
   * argument.
   */
  readFactoryArgument: (
    link: PvlFactoryCall,
    args: ReadFactoryArgs,
  ) => (options: SchemaOptions) => Schema;
};

/** What an ArraySchema holds besides what every Schema does. */
export type ArraySchemaOptions = SchemaOptions & {
  element: Schema;
};

/** What an EnumSchema holds besides what every Schema does. */
export type EnumSchemaOptions = SchemaOptions & {
  members: ReadonlyArray<EnumMember>;
};

/** What a LiteralSchema holds besides what every Schema does. */
export type LiteralSchemaOptions = SchemaOptions & {
  value: PossibleLiteralValue;
};

/** One field of an object Schema. */
export type ObjectField = {
  key: string;
  schema: Schema;
};

/** What an ObjectSchema holds besides what every Schema does. */
export type ObjectSchemaOptions = SchemaOptions & {
  shape: ReadonlyArray<ObjectField>;
};

/** What a UnionSchema holds besides what every Schema does. */
export type UnionSchemaOptions = SchemaOptions & {
  members: ReadonlyArray<Schema>;
};
