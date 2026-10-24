---
name: prototype-code
description: Write throwaway variants of the same code side by side, compare them, then use the one the user picks. Use when a question is about code shape, such as how a signature, type model, internal strategy or module split should look.
---

# Prototype code

A code prototype is **throwaway** code that settles one question about **code shape**: the same behaviour written as several **variants** that differ along exactly one **axis**, laid side by side so the user picks a **winner**. The axis is whatever the question is about: a signature, a parameter shape, a type model, an internal strategy, a module split, or plain syntax.

## 1. Fix the question and the axis

Write the question as one line: "Should `createUser()` take positional arguments or an options object?"

- **The user named the axis**: take it literally, even when it is purely syntactic.
- **The user named only the goal**: propose 2 or 3 candidate axes, each a structural disagreement, and let the user pick one.

Done when the user has agreed to the question and to exactly one axis.

## 2. Write the variants

Read [EXAMPLE.md](EXAMPLE.md) before writing the first variant: it shows a complete variant file and the comparison table.

Write 2 to 5 variants, each a strong answer someone would defend in review. Two strong variants beat four padded ones. Every variant implements the same behaviour; only the axis differs. Leave out error handling and edge cases unless they are the axis.

**Location.** The directory where the real code will live, when it exists; otherwise `prototypes/<question-slug>/` at the repo root.

**Naming.** One file per variant, named for its approach with a `.prototype` infix: `options-object.prototype.ts`, `positional-args.prototype.ts`. A variant spanning several files (a module-split axis) gets a subfolder `<approach>/` holding all its files; single-file variants stay flat.

**Imports.** Import the project's real modules and types, so the type-checker judges each variant against the real code. Where a module or type does not exist yet, write the import a real implementation would use and silence that one line:

```ts
// @ts-expect-error -- prototype: module not implemented yet
import type { UserOptions } from './userOptions.ts';
```

When the project's linter also flags that line, add its inline disable for the specific rule (`// eslint-disable-next-line <rule>`), provided the lint config honours inline comments. When it ignores them (`noInlineConfig`), leave the lint error: step 4 deletes the file. Outside TypeScript, use the language's own line-level suppression. Variants pass under the project's config exactly as it stands.

**File layout.** Every variant file has three parts, in order:

1. A header comment: `PROTOTYPE, delete me`, the question (identical in every variant), this variant's approach in one line, then its pros and cons.
2. The implementation.
3. A **call site**: the code a caller would write. A shape is judged where it is used.

Done when every variant has all three parts and the project's type-checker reports no error in any variant file.

## 3. Compare

Reply with the comparison table: one row per variant, labelled by its approach name, with its file path, pros and cons. The table lives in the reply only.

Done when the table is printed.

## 4. Use the winner

The user picks one variant or a mix ("A's signature with B's body"). A mix is the decision itself; write it as one more variant and return to step 3 only when the user asks to see it.

- **Inside an interview** (a grilling session or similar): the winner answers that session's question. Record it the way the session records answers and return to the session; implementation waits for the session's own plan.
- **Standalone**: implement the winner in the real location under the project's own rules (tests, checks). Rewrite it there rather than copying the variant, adding the error handling and edge cases the variant left out.

Then delete every variant file and subfolder, and the `prototypes/` directory if it is now empty.

Done when the winner is recorded or implemented and no `*.prototype.*` file from this run remains.
