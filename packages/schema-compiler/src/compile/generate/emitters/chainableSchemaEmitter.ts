// The code the Shared Modifiers of `ChainableSchema` compile to, one static
// method per Modifier it mirrors. Each returns the condition the rest of the
// pipeline runs under, since a value it accepts skips every later check.
import { js, type EmitTarget } from './utils.js';

export class ChainableSchemaEmitter {
  /** `.optional()` → `field0 !== undefined`. */
  public static optional({ value }: EmitTarget): string {
    return js`${value} !== undefined`;
  }

  /** `.nullable()` → `field0 !== null`. */
  public static nullable({ value }: EmitTarget): string {
    return js`${value} !== null`;
  }
}
