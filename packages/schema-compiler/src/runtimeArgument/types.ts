// The types of a Runtime Argument: where it is chained, as
// `Schema.findChainedRuntimeArguments` finds it, and how its Compiled Schema's
// constructor takes it, which `RuntimeArgument.getArgumentParameters` reads
// and the Frame writes the class from.
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall } from '../schemas/types.js';
import type { RuntimeArgument } from './runtimeArgument.js';

/** A Runtime Argument with where it is chained: the Schema (`owner`) and the call it is passed to, and its position among the call's arguments. */
export type ChainedRuntimeArgument = {
  argument: RuntimeArgument;
  owner: Schema;
  call: SchemaModifierCall;
  position: number;
};

/** A Runtime Argument as its Compiled Schema's constructor takes it. */
export type RuntimeArgumentParameter = {
  /** The field holding its value, which the checks read: `arg0`. */
  fieldName: string;
  /** The type of the parameter it is passed as: `number`. */
  type: string;
  /** What is passed for it where the `pvl.compile(...)` call was: the argument as written, or the hoisted `const` holding it. */
  passedExpression: string;
  /** The field holding the default message naming it, which the constructor builds once: its name (`arg0Message`) and the message's expression, in terms of the parameter. `undefined` when no default message names it. */
  messageField: { fieldName: string; expression: string } | undefined;
  /** The type parameter the root's class is generic in for it: `TArg0Output` for a `.transform()`'s function at the root, `undefined` otherwise, as a nested class is written inside the root, where its type parameters are in scope. */
  typeParameter: string | undefined;
};
