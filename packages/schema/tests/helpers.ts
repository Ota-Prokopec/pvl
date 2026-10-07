import type { Issue, IssueCode, Result } from '../src/index.js';

/**
 * Narrows a `Result` to its success branch, failing the test with the issues
 * it actually carried when it isn't one — so a test body can read `.value`
 * without re-checking `.issues` on every line.
 *
 * Annotated as an arrow function rather than declared with `function`: an
 * `asserts` predicate requires the name to carry an explicit type annotation,
 * so the signature lives on the binding instead of the expression.
 */
export const assertSuccess: <Output>(
  result: Result<Output>,
) => asserts result is { value: Output; issues?: undefined } = (result) => {
  if (result.issues) {
    throw new Error(`Expected a success Result, got issues: ${JSON.stringify(result.issues)}`);
  }
};

// `issues` is the spec's `Issue[]` intersected with this package's own (see
// ADR-0011), and `.map` resolves to the spec's overload, whose `Issue` has no
// `code` — so the callback names this package's `Issue` explicitly.
/** Each Issue's `code`, in the order the Result reported them. */
export const issueCodes = (result: Result<unknown>): IssueCode[] | undefined =>
  result.issues?.map((issue: Issue) => issue.code);
