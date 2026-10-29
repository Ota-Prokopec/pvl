// The parts an Emitter emits for one Schema, which its Frame composes, the
// steps its pre- and post-modifiers' table methods write them from, the
// names of a composite's locals among them, and the target every Schema is
// checked at.
import type {
  EmittedCheck,
  EmittedCoercion,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedTransform,
  EmittedVariableDeclaration,
} from './emittedText.js';

/**
 * One pre-modifier's part, in chain order: the condition a value
 * short-circuits under (`.optional()`, `.nullable()`), or the conversion
 * replacing it (`.coerce()`).
 */
export type EmittedPreModifierStep =
  { shortCircuitCondition: EmittedShortCircuitCondition } | { coercion: EmittedCoercion };

/**
 * One post-modifier's part, in chain order: its check (a Constraint,
 * `.refine()`, `.strict()`), or the call replacing the value (`.transform()`),
 * which its Frame runs apart from the checks, as `@pcvl/schema` tags it.
 */
export type EmittedPostModifierStep = { check: EmittedCheck } | { transform: EmittedTransform };

/** The names of the locals a composite's checks declare, all ending in the same number, so they never clash with its parent's or its children's. Each composite, root or nested, has its own; its children have none of them, but are checked at the targets built from them: `{ value: 'field1', path: '[...path2, "name"]' }` from `input2` and `path2`. */
export type CompositeLocalVariableNames = {
  /** Its value, read as a record: `input1`. */
  input: string;
  /** The output its checks build, which replaces its value: `output1`. */
  output: string;
  /** The index of the element being checked: `index1`. */
  index: string;
  /** The element being checked: `element1`. */
  element: string;
  /** Its path, which its children's paths extend: `path1`. */
  path: string;
};

/**
 * What a composite checks and builds once its base check has passed,
 * besides its post-modifiers' checks: the locals it declares, its
 * children's checks, which run before its post-modifiers', and the
 * statements building its output, which its Frame then hands on.
 *
 * ```ts
 * <the composite parts of pvl.array(pvl.string()) at field0>
 * // { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'], childChecks: ['for (let index2 = 0; …) { … }'], setsChildrenApart: false, outputStatements: [] }
 * ```
 */
export type SchemaCompositeParts = {
  /** The names of its locals, numbered before any Schema nested in it. Its Frame declares its path and Issue-count locals, and hands its output on. */
  locals: CompositeLocalVariableNames;
  /** The locals it declares itself, after its Frame's own. */
  declarations: EmittedVariableDeclaration[];
  /** Its children's checks, each composed by the child's own Frame. */
  childChecks: string[];
  /** Whether its Frame sets its children's checks apart with a blank line before, between and after them, as an object's fields are; an array's one loop isn't. */
  setsChildrenApart: boolean;
  /** The statements building its output. */
  outputStatements: EmittedOutputStatement[];
};

/**
 * Every part of one Schema's checks, as its Emitter emits them for its
 * Frame to compose. A Schema is a composite exactly when it has `composite`
 * parts: its checks then build an output that replaces its value.
 *
 * ```ts
 * <the parts of pvl.string().optional().min(3) at field0>
 * // { baseCheck: 'if (typeof field0 !== "string") { … }', preModifierSteps: [{ shortCircuitCondition: 'field0 === undefined' }], postModifierChecks: ['if (field0.length < 3) { … }'] }
 * ```
 */
export type SchemaParts = {
  /** Its type check, whose `else` everything but its pre-modifiers' parts and its transform runs in. */
  baseCheck: EmittedCheck;
  /** Its pre-modifiers' parts, in chain order: a condition skips every check after it, and a conversion replaces the value. */
  preModifierSteps: EmittedPreModifierStep[];
  /** Its post-modifiers' checks, which run once its base check has passed, and every child has. */
  postModifierChecks: EmittedCheck[];
  /** What a composite adds; `undefined` for any other Schema. */
  composite?: SchemaCompositeParts;
  /** Its `.transform()`'s call, which replaces its value once its checks have run, and which its Frame gates; `undefined` when it has none. A chain holds at most one, always last. */
  transform?: EmittedTransform;
};

/** A Modifier method input: what an emitter method reads, the value it checks and its paths, each as an expression. Every Schema is checked at one: the root at `Frame.rootCheckingTarget`, a nested one at the target its parent builds from its own locals (`CompositeLocalVariableNames`). */
export type CheckingTarget = {
  /** The checked value, as an expression: `value`, `field0`, `element1`. */
  value: string;
  /** The value's path, as an array expression, which its fields' and elements' paths extend: `path` at the root, `[...path1, "name"]` nested. */
  path: string;
  /** The full `path` of an Issue reported for the value itself, as an expression: `[...path1, "name"]`, not just the key. It holds the same array as `path`, except at the root, where it is `undefined` when `path` is empty, as `@pcvl/schema`'s own `Issue` makes it. */
  issuePath: string;
};
