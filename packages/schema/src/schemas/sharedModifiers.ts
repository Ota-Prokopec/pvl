import { buildIssue, ISSUE_CODE } from '../issue.js';
import type { Result } from '../result.js';
import type { SchemaOptions } from './baseSchema.js';

/**
 * Internal-only module: the record of Shared Modifiers every `Schema` carries
 * (the Modifiers available on every Schema, as opposed to the Local Modifiers
 * a single concrete class stores on itself) plus the decision logic that
 * consumes that record during `_validate` (the optional/nullable short-circuit
 * and the ordered refine/transform step runner), extracted out of
 * `baseSchema.ts` so both are unit-testable as plain functions. Deliberately
 * excluded from `./index.ts`'s barrel — see docs/adr/0006, its amendment, and
 * docs/standards/typescript.md's barrel-file exception for internal-only
 * modules. Not part of `@pvl/schema`'s public API.
 */

export type RefineStep = {
  readonly kind: 'refine';
  readonly predicate: (value: unknown) => boolean;
  readonly options?: SchemaOptions;
};

export type TransformStep = {
  readonly kind: 'transform';
  readonly fn: (value: unknown) => unknown;
};

export type Step = RefineStep | TransformStep;

export type SharedModifiers = {
  readonly isOptional: boolean;
  readonly isNullable: boolean;
  readonly shouldCoerce: boolean;
  readonly steps: ReadonlyArray<Step>;
};

export const DEFAULT_MODIFIERS: SharedModifiers = {
  isOptional: false,
  isNullable: false,
  shouldCoerce: false,
  steps: [],
};

export type ResolveShortCircuitArgs = {
  readonly modifiers: SharedModifiers;
  readonly input: unknown;
};

/**
 * Resolves the optional/nullable short-circuit against a `SharedModifiers`
 * record and an already-coerced input value, returning the short-circuited
 * `Result` when one applies, or `undefined` when neither does and `_checkType`
 * should run instead. Coercion itself happens in `_validate` before this is
 * called (it needs the concrete schema's own `_coerceInput`), so by the time
 * this runs, `input` already reflects `modifiers.shouldCoerce` having applied.
 */
export const resolveShortCircuit = <Output>({
  modifiers,
  input,
}: ResolveShortCircuitArgs): Result<Output> | undefined => {
  if (input === undefined && modifiers.isOptional) {
    return { value: undefined as Output };
  }
  if (input === null && modifiers.isNullable) {
    return { value: null as Output };
  }
  return undefined;
};

export type RunStepsArgs = {
  readonly steps: ReadonlyArray<Step>;
  readonly value: unknown;
  readonly path: ReadonlyArray<PropertyKey>;
};

/**
 * Runs an ordered list of refine/transform steps against a value, in exactly
 * the sequence they were chained (see docs/adr/0010) — a later refine
 * observes an earlier transform's output. A failing refine short-circuits the
 * remaining steps and produces a `CUSTOM` `Issue` at `path`.
 */
export const runSteps = <Output>({ steps, value, path }: RunStepsArgs): Result<Output> => {
  let current = value;

  for (const step of steps) {
    if (step.kind === 'refine') {
      if (!step.predicate(current)) {
        return {
          issues: [buildIssue(ISSUE_CODE.CUSTOM, step.options?.message ?? 'Invalid value', path)],
        };
      }
    } else {
      current = step.fn(current);
    }
  }
  return { value: current as Output };
};
