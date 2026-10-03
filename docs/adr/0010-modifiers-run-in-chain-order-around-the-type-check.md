# Modifiers run in chain order around the type check

Every Modifier on a `@pvl/schema` Schema is one `Modifier` value pushed onto one of two ordered arrays on the `Schema` base class ([ADR-0020](./0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)): **pre-modifiers**, which run before the type check, and **post-modifiers**, which run after it. Each array runs in **chain order**, the order the calls were written. This supersedes this record's earlier decision, which kept `.refine()`/`.transform()` as one ordered step list beside a fixed evaluation order for everything else: the ordering guarantee now covers every Modifier, not just those two.

| Modifier                                                             | Array                  | Tags                                              |
| -------------------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| `.optional()`, `.nullable()`                                         | pre                    | `SHORT_CIRCUIT`                                   |
| `.coerce()`                                                          | pre                    | none                                              |
| Constraints (`.min()`, `.max()`, `.length()`, `.int()`), `.refine()` | post                   | none                                              |
| `object`'s default strip, `.strict()`                                | post                   | none                                              |
| `.transform()`                                                       | post (always the last) | `REQUIRES_ALL_PASSED`, `RUNS_AFTER_SHORT_CIRCUIT` |

A Modifier's `fn` returns `null` (no opinion, continue), `{ issues }` (collect them and continue) or `{ value }` (replace the current value and continue). A `MODIFIER_TAG` changes that reading for one Modifier: `SHORT_CIRCUIT` makes a `{ value }` mean "valid, stop here"; `REQUIRES_ALL_PASSED` skips the step once any `Issue` has been collected; `RUNS_AFTER_SHORT_CIRCUIT` keeps the step running after a short-circuit. `Schema._validate(value, path)` is then exactly:

1. Start with no issues and `current = value`.
2. Run the pre-modifiers in chain order. A `{ value }` from a `SHORT_CIRCUIT` step is accepted as `current` and jumps to step 5, skipping the remaining pre-modifiers, the type check and step 4. Any other `{ value }` (`.coerce()`) replaces `current`.
3. Run `_checkType(current, path)`: the type guard, and on a composite every child through the child's own full `_validate`. If it reports anything, return everything collected so far; no post-modifier runs.
4. Run the post-modifiers in chain order, every one even after another has failed, skipping a `REQUIRES_ALL_PASSED` step once an `Issue` has been collected.
5. After a short-circuit, run only the post-modifiers tagged `RUNS_AFTER_SHORT_CIRCUIT` (`.transform()`), on the accepted value. `.refine()` and every Constraint are skipped.
6. Return `{ issues }` if any were collected, otherwise `{ value: current }`.

Tags rather than rules hard-coded in `_validate` keep a Modifier's special behaviour readable where the Modifier is defined. The alternative, `_validate` checking "is this `.optional()`?" or "is this the transform?", puts the semantics of five Modifiers in one function that has to change whenever one of them does.

Chain order is the user's to choose, and it can change the result. `pvl.string().coerce().optional()` coerces `undefined` to `'undefined'` before `.optional()` sees it; `pvl.string().optional().coerce()` accepts `undefined` first. `object`'s unknown-key mode is the one exception: its default strip is the first post-modifier, and `.strict()`/`.passthrough()` remove it rather than acting at their place in the chain ([ADR-0007](./0007-object-strips-unknown-keys-by-default.md)). A fixed evaluation order was the alternative, and it was rejected: it is a hidden rule a user can only learn by reading the docs, while chain order is what the code already says. The type check stays fixed between the two arrays, so a Constraint can never run against a value of the wrong type, whatever its position in the chain.

`.transform()` ends the chain ([ADR-0016](./0016-transform-and-compile-end-the-modifier-chain.md)), so it is always the last post-modifier and the last thing to run, and only once nothing has failed.
