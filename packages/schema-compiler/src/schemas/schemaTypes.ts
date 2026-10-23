// The types every compiler Schema shares: one method chained onto it, and its
// `Input` and `Output` types spelled as TypeScript.
import type { StaticValue } from '../ast/genericAst.js';
import type { RuntimeArgument } from './runtimeArgument.js';

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
  /**
   * Its place in its Schema's chain, from 0, pre- and post-modifiers
   * counted together, so the types a Modifier sees can be spelled as
   * the methods chained before it left them.
   */
  chainIndex: number;
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
