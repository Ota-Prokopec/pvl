import type { StandardSchemaV1 } from '@standard-schema/spec';
import { VENDOR } from '../consts.js';
import type { Result } from '../result.js';
import {
  DEFAULT_STATE,
  resolveShortCircuit,
  runSteps,
  type RefineStep,
  type SchemaState,
  type TransformStep,
} from './schemaState.js';

export type SchemaOptions = {
  readonly message?: string;
};

/**
 * Shared abstract base every primitive/composite schema class extends.
 * Implements Standard Schema conformance and the chained modifiers common
 * to every schema type exactly once, so a concrete subclass only adds the
 * constructor logic and its own `_checkType` shape check.
 *
 * `.optional()`/`.nullable()`/`.refine()`/`.transform()`/`.coerce()` are
 * instance state on this class (flags plus one ordered step list) rather
 * than wrapper subclasses — see docs/adr/0010-schema-modifier-ordered-step-list.md.
 * This avoids a circular ESM import that wrapper classes extending `Schema`
 * while `Schema` constructs them would otherwise create.
 */
export abstract class Schema<Input = unknown, Output = Input> implements StandardSchemaV1<
  Input,
  Output
> {
  private _state: SchemaState = DEFAULT_STATE;

  get '~standard'(): StandardSchemaV1.Props<Input, Output> {
    return {
      version: 1,
      vendor: VENDOR,
      // Phantom property: never constructed at runtime, only used so
      // `InferInput`/`InferOutput` can read `Input`/`Output` off the type.
      types: undefined as unknown as StandardSchemaV1.Types<Input, Output>,
      validate: (value: unknown): Result<Output> => this.validate(value),
    };
  }

  validate(value: unknown): Result<Output> {
    return this._validate(value, []);
  }

  /**
   * Full-pipeline validation, path-aware so a future composite schema
   * (object/array) can call it on a nested field's schema and get that
   * field's own optional/nullable/coerce/refine/transform behavior applied.
   */
  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    const input = this._state.shouldCoerce ? this._coerceInput(value) : value;

    const shortCircuited = resolveShortCircuit<Output>({ state: this._state, input });
    if (shortCircuited) {
      return shortCircuited;
    }

    const result = this._checkType(input, path);
    if (result.issues) {
      return result;
    }

    return runSteps<Output>({ steps: this._state.steps, value: result.value, path });
  }

  /** The concrete shape check for this schema type (e.g. "is this a string"). */
  abstract _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output>;

  _coerceInput(value: unknown): unknown {
    return value;
  }

  optional(): Schema<Input | undefined, Output | undefined> {
    return this._withState({ isOptional: true }) as Schema<Input | undefined, Output | undefined>;
  }

  nullable(): Schema<Input | null, Output | null> {
    return this._withState({ isNullable: true }) as Schema<Input | null, Output | null>;
  }

  refine(predicate: (value: Output) => boolean, options?: SchemaOptions): Schema<Input, Output> {
    const step: RefineStep = {
      kind: 'refine',
      predicate: predicate as (value: unknown) => boolean,
      options,
    };
    return this._withState({ steps: [...this._state.steps, step] });
  }

  transform<NewOutput>(fn: (value: Output) => NewOutput): Schema<Input, NewOutput> {
    const step: TransformStep = {
      kind: 'transform',
      fn: fn as (value: unknown) => unknown,
    };
    return this._withState({
      steps: [...this._state.steps, step],
    }) as unknown as Schema<Input, NewOutput>;
  }

  coerce(): Schema<unknown, Output> {
    return this._withState({ shouldCoerce: true }) as Schema<unknown, Output>;
  }

  /**
   * Generic, prototype-preserving clone used by every modifier above, so a
   * new concrete schema class never has to implement its own clone/modifier
   * plumbing beyond `_checkType` and (optionally) `_coerceInput`. `_state` is
   * the single grouped field every modifier patches, rather than each flag
   * being cloned independently.
   */
  protected _withState(patch: Partial<SchemaState>): this {
    const clone = Object.create(Object.getPrototypeOf(this) as object) as this;
    Object.assign(clone, this, { _state: { ...this._state, ...patch } });
    return clone;
  }
}
