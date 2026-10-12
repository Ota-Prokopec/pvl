// The types every compiler Schema shares: one method chained onto it, and its
// `Input` and `Output` types spelled as TypeScript.
import type { StaticValue } from '../ast/genericAst.js';

/** One method chained onto a Schema: `.min(3, { message: 'too short' })`. */
export type SchemaModifierCall = {
  name: string;
  /** `undefined` when an argument isn't a literal, such as `.refine()`'s function. */
  args: ReadonlyArray<StaticValue> | undefined;
  /** The 1-based line it is written on. */
  line: number;
};

/** A Schema's `Input` and `Output` types, spelled as TypeScript. */
export type SchemaTypes = {
  input: string;
  /**
   * Not always `input`, nor the factory's own type: `.passthrough()` widens
   * it, and a `.transform()` can make it any type.
   */
  output: string;
};
