// A Schema's `Input` and `Output` types spelled as TypeScript, each with
// whether it admits `undefined`, as an Emitter spells them and a Frame
// writes them into a Compiled Schema's type.
import type { Undefinedness } from './enums.js';

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
