// The code the Shared Modifiers of `ChainableSchema` compile to, one static
// method per Modifier it mirrors. Each returns the condition the rest of the
// pipeline runs under, since a value it accepts skips every later check.
// Every schema's emitter extends it, as every schema extends `ChainableSchema`.
import type { SchemaMethodCall, SchemaModel } from '../schemaModel.js';
import type { EmitScope } from './emitScope.js';
import { Emitter } from './emitter.js';
import { js, type EmitTarget, type SchemaTypes } from './utils.js';

/**
 * `type` with `| undefined` or `| null` added for each `.optional()` and
 * `.nullable()` in `calls`, in chain order.
 *
 * ```ts
 * widenType('string', [nullable(), optional()]) // 'string | null | undefined'
 * widenType('string', [min(3)])                 // 'string'
 * ```
 */
const widenType = (type: string, calls: ReadonlyArray<SchemaMethodCall>): string => {
  return calls.reduce(
    (widened, call) =>
      call.name === 'optional'
        ? `${widened} | undefined`
        : call.name === 'nullable'
          ? `${widened} | null`
          : widened,
    type,
  );
};

export class ChainableSchemaEmitter extends Emitter {
  /** `.optional()` → `field0 !== undefined`. */
  public static optional({ value }: EmitTarget): string {
    return js`${value} !== undefined`;
  }

  /** `.nullable()` → `field0 !== null`. */
  public static nullable({ value }: EmitTarget): string {
    return js`${value} !== null`;
  }

  /**
   * Whether the Schema method `name` is a Shared Modifier, which runs before
   * the type check rather than after it. Only a method counts, not a
   * property every class has.
   *
   * ```ts
   * ChainableSchemaEmitter._isModifier('optional') // true
   * ChainableSchemaEmitter._isModifier('min')      // false
   * ChainableSchemaEmitter._isModifier('length')   // false: the class's own `length` isn't a method
   * ```
   */
  public static _isModifier(name: string): boolean {
    return (
      !name.startsWith('_') &&
      Object.hasOwn(ChainableSchemaEmitter, name) &&
      typeof Reflect.get(ChainableSchemaEmitter, name) === 'function'
    );
  }

  /**
   * The checks `Emitter` writes for the calls that aren't Modifiers, run
   * only once every Modifier's condition holds.
   *
   * ```ts
   * StringSchemaEmitter._emitChecks(<pvl.string().optional()>, { value: 'field0', path }, scope)
   * // if (field0 !== undefined) {
   * //   if (typeof field0 !== "string") { … }
   * // }
   * ```
   */
  public static override _emitChecks(
    schema: SchemaModel,
    target: EmitTarget,
    scope: EmitScope,
  ): string {
    const continuesWhen = schema.calls
      .filter((call) => ChainableSchemaEmitter._isModifier(call.name))
      .map((call) => this.emitCallText(call, target));
    const checks = super._emitChecks(
      {
        ...schema,
        calls: schema.calls.filter((call) => !ChainableSchemaEmitter._isModifier(call.name)),
      },
      target,
      scope,
    );
    return continuesWhen.length === 0
      ? checks
      : Emitter.emitBlock(`if (${continuesWhen.join(' && ')})`, checks);
  }

  /**
   * The types `Emitter` spells, with `| undefined` or `| null` added for each
   * `.optional()` and `.nullable()`, in chain order.
   *
   * ```ts
   * StringSchemaEmitter._emitTypes(<pvl.string().nullable().optional()>, scope)
   * // { input: 'string | null | undefined', output: <the same> }
   * ```
   */
  public static override _emitTypes(schema: SchemaModel, scope: EmitScope): SchemaTypes {
    const { input, output } = super._emitTypes(schema, scope);
    return { input: widenType(input, schema.calls), output: widenType(output, schema.calls) };
  }
}
