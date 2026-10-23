// A Runtime Argument: a method's argument the compiler can't read
// statically, which a Compiled Schema evaluates once, where it is written,
// rather than reading it at compile time (ADR-0030).
import type { Node } from 'ts-morph';

/**
 * A method's argument that isn't a literal written in place, such as a
 * `const`, a parameter, a call or an import: `max` in
 * `(max: number) => pvl.compile(pvl.string().max(max))`. Its Compiled
 * Schema's constructor takes its value, which the expression as written
 * evaluates to, and builds any default message naming it, and its emitted
 * checks read both off the instance.
 * Each one a `pvl.compile(...)` call reaches is numbered in the order it is
 * read, which is the order it is written in.
 *
 * ```ts
 * new RuntimeArgument(<max>, 0).fieldName            // 'arg0'
 * new RuntimeArgument(<max>, 0).emitReading()        // 'this.arg0'
 * new RuntimeArgument(<max>, 0).emitMessageReading() // 'this.arg0Message'
 * ```
 */
export class RuntimeArgument {
  /** The argument as written, which the Compiled Schema evaluates. */
  public readonly expression: Node;
  /** Its place among the Runtime Arguments its `pvl.compile(...)` call reaches, from 0. */
  public readonly index: number;

  /** The Runtime Argument `expression` is, the `index`th one its `pvl.compile(...)` call reaches. */
  public constructor(expression: Node, index: number) {
    this.expression = expression;
    this.index = index;
  }

  /** The Compiled Schema's field holding its value: `arg0`, `arg1`, … */
  public get fieldName(): string {
    return `arg${String(this.index)}`;
  }

  /**
   * How the Compiled Schema's checks read its value: its field, off the
   * instance.
   *
   * ```ts
   * <the 1st Runtime Argument>.emitReading() // 'this.arg0'
   * ```
   */
  public emitReading(): string {
    return `this.${this.fieldName}`;
  }

  /**
   * The type parameter a Compiled Schema is generic in for what it returns,
   * when it is a function whose return type decides the Schema's `Output`,
   * as `.transform()`'s does: `TArg0Output`, …
   */
  public get outputTypeParameterName(): string {
    return `TArg${String(this.index)}Output`;
  }

  /** The Compiled Schema's field holding the default message naming its value, which its constructor builds: `arg0Message`, … */
  public get messageFieldName(): string {
    return `${this.fieldName}Message`;
  }

  /**
   * How the Compiled Schema's checks read the default message naming its
   * value: its field, off the instance.
   *
   * ```ts
   * <the 1st Runtime Argument>.emitMessageReading() // 'this.arg0Message'
   * ```
   */
  public emitMessageReading(): string {
    return `this.${this.messageFieldName}`;
  }
}
