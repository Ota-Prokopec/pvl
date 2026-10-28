// What every Schema holds, and what each subclass holds besides.
import type { EnumMember, PossibleLiteralValue } from '@pvl/schema';
import type { Node } from 'ts-morph';
import type { Module } from '../../module/module.js';
import type { Schema } from '../schema.js';
import type { SchemaModifierCall } from './modifierCall.js';

/** What every Schema holds, whichever factory built it. */
export type SchemaOptions = {
  /** The Module it is written in. */
  module: Module;
  /** The expression it is read from. */
  expression: Node;
  /** Where its factory call is written, as its Module's diagnostics name it (`Module.spellLocation`). */
  location: string;
  /** The Modifiers chained onto its factory call, pre- and post-modifiers together, in chain order, its `.transform()` included, last. */
  calls: ReadonlyArray<SchemaModifierCall>;
  /** Whether `.standalone()` is chained onto it. */
  isStandalone: boolean;
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
