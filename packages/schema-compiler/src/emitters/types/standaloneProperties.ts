// What a compiled composite exposes besides validating: an object's `shape`
// (ADR-0036) and an array's marked `element` (ADR-0039).

/** A compiled object's `shape` (ADR-0036) or a compiled array's marked `element` (ADR-0039), as its class holds it. */
export type EmittedStandaloneProperty = {
  /** Its type, which the Compiled Schema's type intersects: `{ readonly shape: {} }`. */
  type: string;
  /** The field declaring it: `readonly shape: { … };`. */
  declaration: string;
  /** The constructor's statement building it, `undefined` when the declaration initializes it. */
  statement: string | undefined;
};
