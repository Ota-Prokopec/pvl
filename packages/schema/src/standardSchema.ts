import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { VENDOR } from './consts.js';
import type { Result } from './result.js';

// Narrows the spec's `Props` on the vendor, which every Schema built here
// reports as the same literal, and on `validate`, which `@pvl/schema` only
// ever implements synchronously and with its own coded `Issue`s. `Omit` rather
// than a plain intersection: intersecting two `validate` signatures yields an
// overload, and a call resolves to the spec's wider one.
/**
 * The Standard Schema properties every `@pvl/schema` schema reports: `vendor`
 * is exactly `'@pvl/schema'`, and `validate` returns a {@link Result}
 * synchronously.
 *
 * @example
 * ```ts
 * import { pvl, type StandardSchemaProps } from '@pvl/schema';
 *
 * const props: StandardSchemaProps<string, string> = pvl.string()['~standard'];
 * props.vendor; // '@pvl/schema'
 * props.validate('hello'); // { value: 'hello' }
 * ```
 */
export type StandardSchemaProps<Input = unknown, Output = Input> = Omit<
  StandardSchemaV1.Props<Input, Output>,
  'vendor' | 'validate'
> & {
  readonly vendor: typeof VENDOR;
  readonly validate: (value: unknown) => Result<Output>;
};
