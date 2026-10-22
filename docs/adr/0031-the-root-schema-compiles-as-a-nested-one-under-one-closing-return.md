# The root Schema compiles as a nested one, under one closing return

**The Schema `pvl.compile()` wraps is compiled exactly as a nested Schema, at `_validate`'s own parameters, and `_validate` closes with one statement: `return issues.length > 0 ? { issues } : { value };`.** Its checks never return. A composite at the root puts its output back on `value` (`value = output1;`), as a nested one does on the value its parent reads (`field0 = output2;`). A root Frame differs from a nested one only in the class `composeSchema` wraps its checks in and that closing return. This amends [ADR-0028](./0028-emitter-methods-return-source-text-only.md), whose root returned from inside its base check's `else` and wrote `return { issues };` after it.

```ts
_validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
  const issues: PvlIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ code: "INVALID_TYPE", message: "Expected object", path: path.length > 0 ? path : undefined });
  } else {
    const path1 = path;
    const issueCount1 = issues.length;
    const input1 = value as Record<string, unknown>;
    … // each field's checks, at [...path1, "name"]
    if (issues.length === issueCount1) {
      … // .strict()
    }
    const output1: Record<string, unknown> = {};
    output1["name"] = field0;
    value = output1;
  }
  return issues.length > 0 ? { issues } : { value };
}
```

The root and a nested Schema were composed on two code paths. `Frame.composePostModifierChecks` branched on root or nested, composite or leaf, and whether there were any post-modifiers. `Frame.composeChecks` added a trailing `return { issues }`, plus a second `return { value }` for a root a pre-modifier short-circuits. `isRoot` was passed through `AddCompositePartsArgs`, `Emitter.emitDeclarations` and `Emitter.emitOutputHandoff`, and the Frame's position type existed only to make the Compiled Schema's class name act as an `isRoot` flag. All of that is gone. `emitCompiledSchema` builds the root's Frame at `Frame.rootCheckingTarget`, just as a parent builds a child's at the target it hands on, and calls `composeSchema` on it, which now takes the class's name, types, indentation and Runtime Arguments.

The Issues and the accepted values stay the same, and the differential test passes unchanged. The gate a nested composite already runs its post-modifiers behind (`if (issues.length === issueCount1)`) does what the root's early return after its children did: a failing child skips them. ADR-0028 rejected a trailing Issue check because TypeScript stopped narrowing the value for the checks after it. That doesn't apply here, as every check still sits inside the base check's `else`, and the closing return only picks the Result.

A target now carries two paths. `path` is the array a composite's fields' and elements' paths extend, which the composite keeps in its path local. `issuePath` is where an Issue about the value itself is reported. Nested, they are the same expression. At the root they differ, as `path` may be empty, and `@pvl/schema`'s `Issue` reports an empty path as `undefined`: `Frame.rootCheckingTarget` is `{ value: 'value', path: 'path', issuePath: 'path.length > 0 ? path : undefined' }`. So a composite reports its own post-modifiers' Issues at its target's `issuePath`, as its base check does, not at its path local. A nested array's `.min(1)` now reports at `[...path1, "lines"]` rather than at `path2`, the same array. That is the one change to how the code below the root reports an Issue; the other change below it is the numbering of its locals (below).

The accepted costs:

- **One comparison on a leaf root's success path**, and **a failing root composite still building its output.** In a Node 24 micro-benchmark (2×10⁷ calls per variant, each in its own process), neither showed a measurable difference: a passing `pvl.string().max(2)` took about 50 ms either way, and a failing `pvl.object({ name: pvl.string().min(3) }).strict()` took about 820 ms either way.
- **The root composite's locals are numbered like any other** (`input1`, `path1`), so each nested composite's number moves up by one. The root also copies `path` into `path1`, as a nested composite copies its path into its local.

## Considered options

- **The root's target with one path, `path.length > 0 ? path : undefined`.** Rejected: a composite's children spread its path local, which would then be `undefined` for a top-level call. That is a TypeError at runtime, and a type error in the strict typecheck of the emitted code.
- **A composite reports its own Issues at its path local, as before.** Rejected: at the root that local holds `path`, which is `[]` for a top-level call, where `@pvl/schema` reports `undefined`. Telling the root apart again would bring back the branch this removes.
- **The root's locals left unnumbered (`input`, `output`) and its path read straight from the parameter.** Rejected: it keeps a root-only branch in how a Frame names its locals, for output that only reads a little shorter.
