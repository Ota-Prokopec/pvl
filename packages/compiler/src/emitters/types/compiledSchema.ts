// A Compiled Schema as `Emitter.emitCompiledSchema` writes it, the root's or
// a Standalone Key's or marked element's, and what it writes one for.
import type { Node } from 'ts-morph';
import type { Schema } from '../../schemas/schema.js';

/** What `Emitter.emitCompiledSchema` writes a class expression for: at the root, with how its Runtime Arguments are passed, or a Standalone Key's or marked element's, built by its parent. */
export type EmitCompiledSchemaArgs = {
  schema: Schema;
  className: string;
  /** The whitespace the line its `pvl.compile(...)` call is on starts with, which every line of the class after its first is indented by. */
  indentation: string;
  /** Set at the root only: the name of the hoisted `const` holding each Runtime Argument written outside its `pvl.compile(...)` call, by the argument as written. */
  hoistedNameByExpression: ReadonlyMap<Node, string> | undefined;
};

/** A Compiled Schema, as `Emitter.emitCompiledSchema` writes it: the root's, or a Standalone Key's or marked element's. */
export type CompiledSchema = {
  /** The expression building it, a class expression's instance. */
  expression: string;
  /** The type it is cast up to: `PvlSchema<string, string> & PvlStandaloneMarker`. */
  type: string;
};
