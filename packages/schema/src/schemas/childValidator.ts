import type { Issue } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type PvlStandardSchema } from './baseSchema.js';

/**
 * Internal-only module: turns a composite's child — an object field, an array
 * element, a union member — into one path-aware validate function, resolved
 * once at the composite's construction rather than re-dispatched per
 * `.validate()` call. Deliberately excluded from `./index.ts`'s barrel, like
 * `sharedModifiers.ts`; not part of `@pvl/schema`'s public API.
 *
 * A child built by a `pvl.*` factory is a `Schema` instance and is validated
 * through `_validate` with the full path handed down. Any other pvl Standard
 * Schema — a Compiled Schema is the case this exists for — has only its
 * `"~standard".validate`, which knows nothing of where it sits, so every
 * `Issue` it reports gets the composite's path prefixed onto its own — see
 * docs/adr/0018-composites-accept-pvl-standard-schema-fields.md.
 */

export type ChildValidator = (value: unknown, path: ReadonlyArray<PropertyKey>) => Result<unknown>;

const prefixIssue = (issue: Issue, path: ReadonlyArray<PropertyKey>): Issue => ({
  ...issue,
  path: [...path, ...(issue.path ?? [])],
});

export const toChildValidator = (child: PvlStandardSchema): ChildValidator => {
  if (child instanceof Schema) {
    return (value, path) => child._validate(value, path);
  }
  const props = child['~standard'];
  return (value, path) => {
    const result = props.validate(value);
    // At the root there is nothing to prefix, and the child's own Issues
    // already carry the path they should.
    if (!result.issues || path.length === 0) {
      return result;
    }
    // `FailureResult` intersects the spec's issue array with this library's,
    // and array methods resolve against the spec's half; naming the narrower
    // half keeps `code` on each mapped issue.
    const issues: ReadonlyArray<Issue> = result.issues;
    return { issues: issues.map((issue) => prefixIssue(issue, path)) };
  };
};
