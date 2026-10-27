// A method chained onto a Schema, and each of its arguments.
import type { StaticValue } from '../../ast/genericAst.js';
import type { RuntimeArgument } from '../../runtimeArgument/runtimeArgument.js';

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
