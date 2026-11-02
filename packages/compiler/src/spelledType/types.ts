// A Schema's `Input` and `Output` types spelled as TypeScript, each with
// whether it admits `undefined`, as an Emitter spells them and a Frame
// writes them into a Compiled Schema's type, and the type of a method's
// parameter a Compiled Schema's constructor declares, the generic one of a
// function passed `.refine()` or `.transform()` included.
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

/**
 * The type of a function passed `.refine()` or `.transform()`, spelled as
 * TypeScript, which names a type parameter the root's Compiled Schema
 * declares, so TypeScript infers it from the function (ADR-0051).
 *
 * ```ts
 * <the type of trim in .transform(trim)> // { text: '(value: string) => TArg0Output', typeParameter: 'TArg0Output = unknown' }
 * ```
 */
export type SpelledGenericParameterType = {
  text: string;
  /** Declared with a default, so the root's type parameters come in their Runtime Arguments' order. */
  typeParameter: string;
};

/**
 * The type of a method's parameter, spelled as TypeScript, which a Compiled
 * Schema's constructor declares a Runtime Argument passed there with: as
 * text, or as a function's type naming its type parameter.
 *
 * ```ts
 * <the type of max in .max(max)> // 'number'
 * ```
 */
export type SpelledParameterType = string | SpelledGenericParameterType;
