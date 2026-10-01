import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { VENDOR } from './consts.js';
import type { Result } from './result.js';

// Narrows the spec's `Props` on the two members a composite relies on: the
// vendor, so a schema from another library is rejected as a field at the type
// level (there is no runtime vendor check — see ADR-0018), and `validate`,
// which `@pvl/schema` only ever implements synchronously and with its own
// coded `Issue`s. `Omit` rather than a plain intersection: intersecting two
// `validate` signatures yields an overload, and a call resolves to the spec's
// wider one.
/**
 * The Standard Schema properties every `@pvl/schema` schema reports: `vendor`
 * is exactly `'@pvl/schema'`, and `validate` returns a {@link Result}
 * synchronously.
 *
 * @example
 * ```ts
 * import { pvl, type PvlStandardProps } from '@pvl/schema';
 *
 * const props: PvlStandardProps<string, string> = pvl.string()['~standard'];
 * props.vendor; // '@pvl/schema'
 * props.validate('hello'); // { value: 'hello' }
 * ```
 */
export type PvlStandardProps<Input = unknown, Output = Input> = Omit<
  StandardSchemaV1.Props<Input, Output>,
  'vendor' | 'validate'
> & {
  readonly vendor: typeof VENDOR;
  readonly validate: (value: unknown) => Result<Output>;
};

/**
 * A Standard Schema produced by `@pvl/schema` itself — any `pvl.*` schema, or
 * a Compiled Schema from `@pvl/schema-compiler`. It is what an object schema
 * accepts as a field and an array schema as its element. A schema from
 * another library is rejected as one, even though it implements Standard
 * Schema too.
 *
 * @example
 * ```ts
 * import { pvl, type PvlStandardSchema } from '@pvl/schema';
 *
 * const name: PvlStandardSchema<string> = pvl.string().min(1);
 * const user = pvl.object({ name });
 *
 * user.validate({ name: '' }); // { issues: [{ code: 'TOO_SMALL', path: ['name'], ... }] }
 * ```
 */
export type PvlStandardSchema<Input = unknown, Output = Input> = {
  readonly '~standard': PvlStandardProps<Input, Output>;
};
