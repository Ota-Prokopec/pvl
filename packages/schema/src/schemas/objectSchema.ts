import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';
import { buildIssue, ISSUE_CODE, type Issue } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/**
 * What an `ObjectSchema` does with keys its shape doesn't declare. Exactly one
 * is active per instance: strip (the default) drops them, strict reports them
 * as `Issue`s, passthrough keeps them untyped — see ADR-0007.
 */
export const UNKNOWN_KEYS = {
  STRIP: 'STRIP',
  STRICT: 'STRICT',
  PASSTHROUGH: 'PASSTHROUGH',
} as const;

export type UnknownKeys = ValueOfEnum<typeof UNKNOWN_KEYS>;

/** The field schemas an object schema composes, one per declared key. */
export type ObjectShape = Readonly<Record<string, Schema<unknown, unknown>>>;

type ShapeInput<Shape extends ObjectShape> = {
  [Key in keyof Shape]: StandardSchemaV1.InferInput<Shape[Key]>;
};

type ShapeOutput<Shape extends ObjectShape> = {
  [Key in keyof Shape]: StandardSchemaV1.InferOutput<Shape[Key]>;
};

/**
 * The keys a caller may leave out entirely. A field whose schema is
 * `.optional()` widens to include `undefined`, which is the only signal the
 * composed type has that the key itself is optional rather than required and
 * possibly undefined.
 */
type OptionalFieldKeys<Fields> = {
  [Key in keyof Fields]-?: undefined extends Fields[Key] ? Key : never;
}[keyof Fields];

/** Re-maps an intersection into one flat object type, preserving `?` modifiers. */
type Flatten<Fields> = { [Key in keyof Fields]: Fields[Key] };

/** The per-field types composed into a single object type, `?` applied. */
type ComposeObject<Fields> = Flatten<
  {
    [Key in Exclude<keyof Fields, OptionalFieldKeys<Fields>>]: Fields[Key];
  } & {
    [Key in OptionalFieldKeys<Fields>]?: Fields[Key];
  }
>;

/**
 * The input type is the same in every unknown-key mode: extra keys are a
 * property of the value handed in, not of what the schema asks for, and
 * `.strict()` rejects them at runtime rather than at the type level.
 */
export type ObjectInput<Shape extends ObjectShape> = ComposeObject<ShapeInput<Shape>>;

/**
 * `.passthrough()` keeps unrecognized keys in the output, so its type carries
 * an `unknown`-valued index signature alongside the declared keys; the other
 * two modes output the declared keys only.
 */
export type ObjectOutput<
  Shape extends ObjectShape,
  Mode extends UnknownKeys,
> = Mode extends typeof UNKNOWN_KEYS.PASSTHROUGH
  ? ComposeObject<ShapeOutput<Shape>> & Record<string, unknown>
  : ComposeObject<ShapeOutput<Shape>>;

/**
 * Plain `target[key] = value` would hit `Object.prototype`'s `__proto__`
 * setter for that one key name — which `JSON.parse('{"__proto__":{}}')`
 * produces as a real own property — silently reparenting the output instead of
 * copying the key. `defineProperty` writes it as the own data property it was.
 */
const assignKey = (target: Record<string, unknown>, key: string, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return;
  }
  target[key] = value;
};

/**
 * Validates each declared key against its own field schema, composing those
 * schemas into one object type. Every field is checked even after an earlier
 * one fails, so a caller gets every `Issue` in one pass rather than one per
 * round-trip — see ADR-0012.
 *
 * Each field is validated through its own full pipeline (its `.optional()`,
 * `.nullable()`, `.coerce()`, `.refine()`, `.transform()`), with the field's
 * key appended to the path so a nested failure reports where it happened.
 *
 * `.coerce()` is inherited but has no object-specific conversion: there is no
 * one unambiguous way to read an object out of a non-object, so a value that
 * isn't one is rejected rather than guessed at. A field that needs coercion
 * opts into it on its own schema.
 */
export class ObjectSchema<
  Shape extends ObjectShape,
  Mode extends UnknownKeys = typeof UNKNOWN_KEYS.STRIP,
> extends Schema<ObjectInput<Shape>, ObjectOutput<Shape, Mode>> {
  private readonly _typeMessage: string;
  // `Mode` is a type-level marker for the output type only; the runtime field
  // is the plain union, so the clone below can re-point it without a cast.
  private _unknownKeys: UnknownKeys = UNKNOWN_KEYS.STRIP;
  private _unknownKeyMessage: string | undefined;
  // Derived from the shape once at construction rather than per `.validate()`
  // call, since both sit on the validation hot path.
  private readonly _fields: ReadonlyArray<readonly [string, Schema<unknown, unknown>]>;
  private readonly _declaredKeys: ReadonlySet<string>;

  constructor(shape: Shape, options?: SchemaOptions) {
    super();
    this._typeMessage = options?.message ?? 'Expected object';
    this._fields = Object.entries(shape);
    this._declaredKeys = new Set(Object.keys(shape));
  }

  /** Report keys the shape doesn't declare as `Issue`s instead of stripping them. */
  strict(options?: SchemaOptions): ObjectSchema<Shape, typeof UNKNOWN_KEYS.STRICT> {
    return this._withUnknownKeys(UNKNOWN_KEYS.STRICT, options?.message);
  }

  /** Keep keys the shape doesn't declare, untyped, instead of stripping them. */
  passthrough(): ObjectSchema<Shape, typeof UNKNOWN_KEYS.PASSTHROUGH> {
    return this._withUnknownKeys(UNKNOWN_KEYS.PASSTHROUGH);
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<ObjectOutput<Shape, Mode>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const issues: Issue[] = [];

    for (const [key, field] of this._fields) {
      const result = field._validate(input[key], [...path, key]);
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      // An omitted optional field stays omitted rather than becoming an
      // explicit `undefined` property of the output.
      if (result.value === undefined && !Object.hasOwn(input, key)) {
        continue;
      }
      assignKey(output, key, result.value);
    }

    if (this._unknownKeys !== UNKNOWN_KEYS.STRIP) {
      for (const key of Object.keys(input)) {
        if (this._declaredKeys.has(key)) {
          continue;
        }
        if (this._unknownKeys === UNKNOWN_KEYS.STRICT) {
          issues.push(
            buildIssue(
              ISSUE_CODE.UNRECOGNIZED_KEY,
              this._unknownKeyMessage ?? `Unrecognized key "${key}"`,
              [...path, key],
            ),
          );
          continue;
        }
        assignKey(output, key, input[key]);
      }
    }

    if (issues.length > 0) {
      return { issues };
    }
    // The loops above built `output` key by key from each field's own result,
    // which the type system can't follow back to the composed object type.
    return { value: output as ObjectOutput<Shape, Mode> };
  }

  /**
   * Clones through the base class's prototype-preserving clone, so any
   * modifier already chained onto this instance survives, then re-points the
   * unknown-key fields. Constructing a fresh `ObjectSchema` instead would
   * reset the base `Schema` state and silently drop those modifiers.
   */
  private _withUnknownKeys<NextMode extends UnknownKeys>(
    unknownKeys: NextMode,
    unknownKeyMessage?: string,
  ): ObjectSchema<Shape, NextMode> {
    const clone = this._withState({}) as unknown as ObjectSchema<Shape, NextMode>;
    clone._unknownKeys = unknownKeys;
    clone._unknownKeyMessage = unknownKeyMessage;
    return clone;
  }
}
