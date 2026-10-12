import type { StaticValue } from '../ast/genericAst.js';

/** One method chained onto a Schema: `.min(3, { message: 'too short' })`. */
export type SchemaModifierCall = {
  name: string;
  /** `undefined` when an argument isn't a literal, such as `.refine()`'s function. */
  args: ReadonlyArray<StaticValue> | undefined;
  /** The 1-based line it is written on. */
  line: number;
};
