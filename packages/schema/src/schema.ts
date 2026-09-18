import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ISSUE_CODE, type IssueCode } from "./issue-code.js";

const VENDOR = "@pvl/schema";

export type SchemaOptions = {
  readonly message?: string;
};

/**
 * Extends the base Standard Schema `Issue` with a `code` for programmatic
 * matching. Extra fields are structurally compatible with
 * `StandardSchemaV1.Issue` (message/path), so this stays the single
 * representation returned by both `.validate()` and `"~standard".validate`.
 */
export type Issue = StandardSchemaV1.Issue & {
  readonly code: IssueCode;
};

export type Result<Output> = StandardSchemaV1.Result<Output>;

export const buildIssue = (
  code: IssueCode,
  message: string,
  path: ReadonlyArray<PropertyKey>,
): Issue => ({
  code,
  message,
  ...(path.length > 0 ? { path: [...path] } : {}),
});

type SchemaInput<S> = S extends Schema<infer Input, unknown> ? Input : never;
type SchemaOutput<S> = S extends Schema<unknown, infer Output> ? Output : never;

/**
 * Shared abstract base every primitive/composite schema class extends.
 * Implements Standard Schema conformance and the chained modifiers common
 * to every schema type exactly once, so a concrete subclass only adds the
 * constructor logic and checks specific to its own shape.
 */
export abstract class Schema<Input = unknown, Output = Input> {
  get "~standard"(): StandardSchemaV1.Props<Input, Output> {
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

  abstract _validate(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<Output>;

  _coerceInput(value: unknown): unknown {
    return value;
  }

  optional(): OptionalSchema<this> {
    return new OptionalSchema(this);
  }

  nullable(): NullableSchema<this> {
    return new NullableSchema(this);
  }

  refine(
    predicate: (value: Output) => boolean,
    options?: SchemaOptions,
  ): RefinedSchema<this> {
    return new RefinedSchema(this, predicate, options);
  }

  transform<NewOutput>(
    fn: (value: Output) => NewOutput,
  ): TransformedSchema<this, NewOutput> {
    return new TransformedSchema(this, fn);
  }

  coerce(): CoercedSchema<this> {
    return new CoercedSchema(this);
  }
}

export class OptionalSchema<S extends Schema<unknown, unknown>> extends Schema<
  SchemaInput<S> | undefined,
  SchemaOutput<S> | undefined
> {
  constructor(private readonly inner: S) {
    super();
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<SchemaOutput<S> | undefined> {
    if (value === undefined) {
      return { value: undefined };
    }
    return this.inner._validate(value, path) as Result<
      SchemaOutput<S> | undefined
    >;
  }

  override _coerceInput(value: unknown): unknown {
    return this.inner._coerceInput(value);
  }
}

export class NullableSchema<S extends Schema<unknown, unknown>> extends Schema<
  SchemaInput<S> | null,
  SchemaOutput<S> | null
> {
  constructor(private readonly inner: S) {
    super();
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<SchemaOutput<S> | null> {
    if (value === null) {
      return { value: null };
    }
    return this.inner._validate(value, path) as Result<SchemaOutput<S> | null>;
  }

  override _coerceInput(value: unknown): unknown {
    return this.inner._coerceInput(value);
  }
}

export class RefinedSchema<S extends Schema<unknown, unknown>> extends Schema<
  SchemaInput<S>,
  SchemaOutput<S>
> {
  constructor(
    private readonly inner: S,
    private readonly predicate: (value: SchemaOutput<S>) => boolean,
    private readonly options?: SchemaOptions,
  ) {
    super();
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<SchemaOutput<S>> {
    const result = this.inner._validate(value, path) as Result<SchemaOutput<S>>;
    if (result.issues) {
      return result;
    }
    if (!this.predicate(result.value)) {
      return {
        issues: [
          buildIssue(
            ISSUE_CODE.CUSTOM,
            this.options?.message ?? "Invalid value",
            path,
          ),
        ],
      };
    }
    return result;
  }

  override _coerceInput(value: unknown): unknown {
    return this.inner._coerceInput(value);
  }
}

export class TransformedSchema<
  S extends Schema<unknown, unknown>,
  NewOutput,
> extends Schema<SchemaInput<S>, NewOutput> {
  constructor(
    private readonly inner: S,
    private readonly fn: (value: SchemaOutput<S>) => NewOutput,
  ) {
    super();
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<NewOutput> {
    const result = this.inner._validate(value, path) as Result<SchemaOutput<S>>;
    if (result.issues) {
      return result;
    }
    return { value: this.fn(result.value) };
  }

  override _coerceInput(value: unknown): unknown {
    return this.inner._coerceInput(value);
  }
}

export class CoercedSchema<S extends Schema<unknown, unknown>> extends Schema<
  unknown,
  SchemaOutput<S>
> {
  constructor(private readonly inner: S) {
    super();
  }

  _validate(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<SchemaOutput<S>> {
    const coerced = this.inner._coerceInput(value);
    return this.inner._validate(coerced, path) as Result<SchemaOutput<S>>;
  }
}
