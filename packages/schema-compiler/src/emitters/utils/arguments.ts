// How a method's argument is read in the emitted code: a literal written as
// one, a Runtime Argument off the Compiled Schema's instance, and a function
// the user passed, checked to be the Runtime Argument it always is, called
// with no `this`.
import type { PossibleLiteralValue } from '@pvl/schema';
import type { AnyFunction } from '@repo/types';
import { RuntimeArgument } from '../../schemas/runtimeArgument.js';
import { js } from './js.js';
import { emitLiteral } from './literal.js';

/**
 * A method's argument as the emitted code reads it: a literal written as
 * one, a Runtime Argument off the Compiled Schema's instance.
 *
 * ```ts
 * emitArgument(3)                       // '3'
 * emitArgument(10n)                     // '10n'
 * emitArgument(<the 1st Runtime Argument>) // 'this.arg0'
 * ```
 */
export const emitArgument = (argument: PossibleLiteralValue | RuntimeArgument): string => {
  return argument instanceof RuntimeArgument ? argument.emitReading() : emitLiteral(argument);
};

/**
 * A call to a function the user passed a method, `.refine()`'s predicate or
 * `.transform()`'s function, on `value`, read off the Compiled Schema's
 * instance (`readFunctionArgument`) and called with no `this`, as the
 * interpreted path calls it, so a `function` never sees the instance. Its
 * constructor types the function's parameter as the
 * interpreted Schema does at that point of its chain, but `value` may be
 * typed otherwise where it is read (a literal's check doesn't narrow it, a
 * composite's output is a record), so it is passed as `never`: the
 * compiler checks syntax, not types (ADR-0024).
 *
 * ```ts
 * emitFunctionCall(<the 1st Runtime Argument>, 'field0') // 'this.arg0.call(undefined, field0 as never)'
 * ```
 */
export const emitFunctionCall = (fn: RuntimeArgument | AnyFunction, value: string): string => {
  return js`${readFunctionArgument(fn).emitReading()}.call(undefined, ${value} as never)`;
};

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
