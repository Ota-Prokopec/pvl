import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Result } from './result.js';
import type { Schema } from './schemas/schema.js';

export type Modifier<Input, Output> = {
  fn: (value: Input, path: ReadonlyArray<PropertyKey>) => Result<Output> | null;
  // The factory that built this modifier, so `_withoutModifiers` can remove
  // every modifier of that shape whichever instance a schema holds. Left out
  // on a modifier nothing ever removes.
  shape?: ModifierShape;
};

// A function that builds modifiers; its identity is the shape it stamps on
// each one.
export type ModifierShape = (...args: never[]) => Modifier<unknown, unknown>;

export type InferInput<TSchema extends Schema> = StandardSchemaV1.InferInput<TSchema>;
export type InferOutput<TSchema extends Schema> = StandardSchemaV1.InferOutput<TSchema>;
