---
name: prototype-code
description: Write several throwaway variants of the same code, compare their pros and cons, then use the one the user picks.
disable-model-invocation: true
---

# Prototype code

A code prototype is **throwaway code that settles a question about code shape**: the same piece of code written as several **variants** that disagree along one **axis**, laid side by side so the user can pick a **winner**. The axis is whatever the user asks about: a signature, a parameter shape, a type model, an internal strategy, a module split, plain syntax. It runs most often in the middle of a `/grilling`-style session, when a question there is about how the code should look.

## 1. Fix the question and the axis

State the question in one line ("Should `compile()` take positional args or an options object?").

- **The user named the axis**: follow it literally, even when it is purely syntactic.
- **The user named only the goal**: propose 2–3 candidate axes, each a structural disagreement (signature, type model, strategy, module split), and wait for the user to pick one.

Done when the question and exactly one axis are agreed.

## 2. Write the variants

Write only **great** variants: each a genuinely strong answer someone would defend, never filler added to reach a count. At most 5. Each variant is a complete, believable implementation of the same behaviour; only the axis differs.

**Location.** Put the variants where the real code will live once implemented, if that directory already exists. Otherwise put them under `prototypes/<question-slug>/` at the repo root.

**Naming.** One file per variant, named for its approach: `options-object.prototype.ts`, `args-array.prototype.ts`. A variant that needs several files (a module-split axis) gets its own subfolder, `<approach>/`, holding all its files; single-file variants stay flat.

**Imports.** Import the project's real modules and types. When a module or type doesn't exist yet, invent the import a real implementation would use, and silence only that line, so the rest of the variant is still checked against the real code:

```ts
// @ts-expect-error -- prototype: module not implemented yet
import type { CompileOptions } from './compileOptions.ts';
```

Add an `eslint-disable-next-line <rule>` too when the project's linter reports that line and honours inline comments (a config with `noInlineConfig` ignores them; leave that lint error for the cleanup to remove), and use the language's equivalent outside TypeScript. Change no project config to make a variant pass.

**File layout.** Every variant file has the same three parts:

1. A header comment: `PROTOTYPE, delete me`, the question (identical in every variant), this variant's approach in one line, then its **pros** and **cons**.
2. The implementation.
3. A **call site** at the bottom: the code as a caller would write it, since a shape is judged where it is used.

Done when every variant has its header, implementation and call site, and the project's type-checker reports no error in any variant file.

## 3. Compare

Print a pros/cons table in the session, one row per variant, labelled by the file's approach name, with the file paths. The table is the reply; write no README.

Done when the table is printed and the user has the paths.

## 4. Use the winner

The user picks one variant, or a mix ("A's signature with B's body"). Take a mix as the decision itself, unless the user asks to see it first; then write it as one more variant and compare again.

- **Inside a grilling session**: the winner is the answer to that session's question. Record it the way the session records answers and continue the session; implement nothing.
- **Standalone**: implement the winner properly in the real location, following the project's own rules (tests, checks). Rewrite it there instead of copying the prototype: the prototype skipped error handling.

Then delete every prototype file and folder, including an emptied `prototypes/` directory.

Done when the winner is used and no `*.prototype.*` file from this run remains.
