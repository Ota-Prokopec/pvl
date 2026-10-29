// How a function the user passed a method is read from its call: checked to
// be the Runtime Argument it always is.
import { RuntimeArgument } from './runtimeArgument.js';

/**
 * A function the user passed a method, `.refine()`'s predicate or
 * `.transform()`'s function, as read from its call, checked to be the
 * Runtime Argument it always is, as it is never a literal; anything else is
 * a bug in the compiler, never a user error, which throws.
 *
 * ```ts
 * readFunctionArgument(<the 1st Runtime Argument>) // <the 1st Runtime Argument>
 * readFunctionArgument((value) => value > 0)      // throws: a function is never read as a literal
 * readFunctionArgument(undefined)                 // throws: a spread argument has no position
 * ```
 */
export const readFunctionArgument = (fn: unknown): RuntimeArgument => {
  if (!(fn instanceof RuntimeArgument)) {
    throw new Error(`A function passed a method is always a Runtime Argument, not ${String(fn)}.`);
  }
  return fn;
};
