// The types every compiler Schema shares: one method chained onto it, and its
// `Input` and `Output` types spelled as TypeScript, each with whether it
// admits `undefined`.
import type { StaticValue } from '../ast/genericAst.js';
import type { Undefinedness } from '../enums.js';
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
};

/**
 * A type spelled as TypeScript, and whether it admits `undefined`, which
 * decides whether an object key of that type may be left out.
 *
 * ```ts
 * <the Output of pvl.string().optional()>      // { text: 'string | undefined', undefinedness: 'ALWAYS' }
 * <the Output of pvl.string().transform(trim)> // { text: 'TArg0Output', undefinedness: 'CONDITIONAL' }
 * ```
 */
export type SpelledType = {
  text: string;
  undefinedness: Undefinedness;
};

/** A Schema's `Input` and `Output` types, spelled as TypeScript. */
export type SchemaTypes = {
  input: SpelledType;
  /**
   * Not always `input`, nor the factory's own type: `.passthrough()` widens
   * it, and a `.transform()` can make it any type.
   */
  output: SpelledType;
};
