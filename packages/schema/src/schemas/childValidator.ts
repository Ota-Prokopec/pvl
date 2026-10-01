// Internal-only: how a composite validates one of its children (an object
// field, an array element) at that child's path. Deliberately left out of the
// `schemas/` barrel — no consumer imports it.
import type { Issue } from '../issue.js';
import type { PvlStandardSchema } from '../pvlStandardSchema.js';
import type { Result } from '../result.js';
import { Schema } from './baseSchema.js';

/**
 * Validates one child value, reporting any `Issue` at `path` — the composite's
 * own path with the child's key or index already appended.
 *
 * @internal
 */
export type ChildValidator = (value: unknown, path: ReadonlyArray<PropertyKey>) => Result<unknown>;

/**
 * Resolves, once at construction rather than per `.validate()` call, how a
 * composite reaches a child. One of this package's own classes keeps the
 * path-aware `_validate`, so it builds its `Issue` paths in place. Anything
 * else — a Compiled Schema is a plain Standard Schema object — only offers
 * `~standard.validate`, which knows nothing of where it sits, so its `Issue`
 * paths come back relative to itself and get `path` prefixed on. See ADR-0018.
 *
 * @internal
 */
export const toChildValidator = (child: PvlStandardSchema): ChildValidator => {
  if (child instanceof Schema) {
    return (value, path) => child._validate(value, path);
  }
  // Called as a method rather than detached, so a `validate` relying on `this`
  // still sees its own `~standard` object.
  const standard = child['~standard'];
  return (value, path) => {
    const result = standard.validate(value);
    if (!result.issues) {
      return result;
    }
    // `issues` is typed as the spec's array intersected with ours, and `.map`
    // resolves against the spec's; pinning it keeps each `Issue`'s `code`.
    const issues: ReadonlyArray<Issue> = result.issues;
    return {
      issues: issues.map((issue) => ({ ...issue, path: [...path, ...(issue.path ?? [])] })),
    };
  };
};
