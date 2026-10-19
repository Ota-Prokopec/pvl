// The `Modifier` type every schema's pipeline runs (ADR-0010), and nothing
// else; `enums.ts` holds the tags that describe one. A Modifier itself lives
// with the schema class that builds it, either inline in the method or as a
// module-local, non-exported factory beside the class (`object`'s unknown-key
// modifiers in `objectSchema.ts`), because a schema file is in the barrel.
// Internal-only, so it stays out of the barrel.
import type { Result } from '../result.js';
import type { ModifierTag } from './enums.js';

export type Modifier<Input, Output> = {
  fn: (value: Input, path: ReadonlyArray<PropertyKey>) => Result<Output> | null;
  tags?: ReadonlyArray<ModifierTag>;
  // The factory that built this modifier, so `_withoutModifiers` can remove
  // every modifier of that shape whichever instance a schema holds. Left out
  // on a modifier nothing ever removes.
  shape?: ModifierShape;
};

// A function that builds modifiers; its identity is the shape it stamps on
// each one.
export type ModifierShape = (...args: never[]) => Modifier<unknown, unknown>;
