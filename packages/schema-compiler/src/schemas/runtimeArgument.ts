// A Runtime Argument: a method's argument the compiler can't read
// statically, which a Compiled Schema evaluates once, where it is written,
// rather than reading it at compile time (ADR-0030).
import type { Node } from 'ts-morph';
import type { RuntimeArgumentParameter } from '../frame/frame.js';
import { js } from '../emitters/utils/js.js';
import { emitMessageAroundValue } from '../issue.js';
import type { Schema } from './schema.js';
import type { SchemaModifierCall } from './schemaTypes.js';

/** What {@link RuntimeArgument.getArgumentParameters} reads a Compiled Schema's Runtime Arguments for: its Schema, and, at the root, the hoisted `const`s holding them; `undefined` for a nested class, which is passed its parent's fields. */
type GetArgumentParametersArgs = {
  schema: Schema;
  hoistedNameByExpression: ReadonlyMap<Node, string> | undefined;
};

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

  /**
   * Every Runtime Argument of the methods chained onto `schema` and onto
   * every Schema nested in it, in the order they are numbered, as its
   * Compiled Schema's constructor takes them: the type of the parameter, from
   * its own Schema's emitter (`parameterTypes`); what is passed for it, the
   * argument as written or its hoisted `const` at the root, its parent's
   * field in a nested class; when it is a method's first argument, the
   * default message naming it (`argumentMessages`); and, when it is a
   * `.transform()`'s function, the type parameter its return type is
   * inferred as. Throws for a parameter with no type, which is a bug in an
   * emitter, never a user error.
   *
   * ```ts
   * RuntimeArgument.getArgumentParameters({ schema: <pvl.string().max(max)>, hoistedNameByExpression: new Map() })
   * // [{ fieldName: 'arg0', type: 'number', passedExpression: 'max', messageField: { fieldName: 'arg0Message', expression: '`String must contain at most ${arg0} character(s)`' }, typeParameter: undefined }]
   * RuntimeArgument.getArgumentParameters({ schema: <pvl.string().transform(trim)>, hoistedNameByExpression: undefined })
   * // [{ fieldName: 'arg0', type: '(value: string) => TArg0Output', passedExpression: 'this.arg0', messageField: undefined, typeParameter: 'TArg0Output' }]
   * ```
   */
  public static getArgumentParameters({
    schema,
    hoistedNameByExpression,
  }: GetArgumentParametersArgs): RuntimeArgumentParameter[] {
    return RuntimeArgument.findChainedArguments({ schema })
      .sort((left, right) => left.argument.index - right.argument.index)
      .map(({ argument, owner, call, position }) => {
        const { emitter } = owner;
        const type = emitter._spellParameterTypes({ schema: owner, call })?.[position];
        if (type === undefined) {
          throw new Error(
            `${emitter.name} has no type for argument ${String(position)} of .${call.name}().`,
          );
        }
        // Only a method's first argument is a value its default message names.
        const messageOf = position === 0 ? emitter.argumentMessages[call.name] : undefined;
        return {
          fieldName: argument.fieldName,
          type,
          passedExpression:
            hoistedNameByExpression === undefined
              ? js`this.${argument.fieldName}`
              : (hoistedNameByExpression.get(argument.expression) ?? argument.expression.getText()),
          messageField:
            messageOf === undefined
              ? undefined
              : {
                  fieldName: argument.messageFieldName,
                  expression: emitMessageAroundValue(messageOf, argument.fieldName),
                },
          typeParameter:
            call === owner.transformCall && position === 0
              ? argument.outputTypeParameterName
              : undefined,
        };
      });
  }

  /**
   * Every Runtime Argument of the methods chained onto `schema` and onto
   * every Schema nested in it, its own first, each with the Schema (`owner`)
   * and the call it is passed to and its position among the call's arguments.
   *
   * ```ts
   * RuntimeArgument.findChainedArguments({ schema: <pvl.string().max(max)> })
   * // [{ argument: <max>, owner: <pvl.string().max(max)>, call: <.max(max)>, position: 0 }]
   * ```
   */
  private static findChainedArguments({ schema }: { schema: Schema }): Array<{
    argument: RuntimeArgument;
    owner: Schema;
    call: SchemaModifierCall;
    position: number;
  }> {
    return [
      ...schema.chainedCalls.flatMap((call) =>
        (call.args ?? []).flatMap((argument, position) =>
          argument instanceof RuntimeArgument ? [{ argument, owner: schema, call, position }] : [],
        ),
      ),
      ...schema
        .findChildren()
        .flatMap((child) => RuntimeArgument.findChainedArguments({ schema: child })),
    ];
  }
}
