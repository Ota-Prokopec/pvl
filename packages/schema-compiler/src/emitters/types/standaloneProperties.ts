// What a compiled composite exposes besides validating: an object's `shape`
// (ADR-0036) and an array's marked `element` (ADR-0039).
import type { ComposedShapeOrElement } from '../../frame/frame.js';

/** A compiled object's `shape`, as its class holds it (ADR-0036). */
export type EmittedShapeProperty = {
  /** Its type, which the Compiled Schema's type intersects: `{ readonly shape: {} }`. */
  type: string;
  /** How the class declares and builds it. */
  composed: ComposedShapeOrElement;
};

/** A compiled array's marked `element`, as its class holds it (ADR-0039). */
export type EmittedElementProperty = {
  /** Its type, which the Compiled Schema's type intersects: `{ readonly element: PvlSchema<string, string> & PvlStandaloneMarker }`. */
  type: string;
  /** How the class declares and builds it. */
  composed: ComposedShapeOrElement;
};
