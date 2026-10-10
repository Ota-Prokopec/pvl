// What emitting one Compiled Schema's class shares across every Schema
// nested in it: the emitter of each, and fresh names for the locals the
// emitted code declares.
import type { SchemaModel } from '../compilation/generate/schemaModel.js';
import type { Emitter } from './emitter.js';

/** Finds the emitter of a Schema nested in a Compiled Schema. */
export type FindEmitter = (schema: SchemaModel) => typeof Emitter;

/**
 * What emitting one Compiled Schema's class shares across every Schema
 * nested in it: the emitter of each, and a fresh name for each local the
 * emitted code declares. Names are numbered across the whole class rather
 * than built from their parent's, so they stay short at any depth.
 *
 * ```ts
 * const scope = new EmitScope(findEmitter);
 * scope.nextField() // 'field0'
 * scope.nextField() // 'field1'
 * scope.nextLocalSuffix() // '1': a nested composite's locals are `input1`, `path1`, …
 * ```
 */
export class EmitScope {
  public readonly findEmitter: FindEmitter;

  private fieldCount = 0;

  private nodeCount = 0;

  public constructor(findEmitter: FindEmitter) {
    this.findEmitter = findEmitter;
  }

  /** The name of the next field's value: `field0`, `field1`, … */
  public nextField(): string {
    const name = `field${String(this.fieldCount)}`;
    this.fieldCount += 1;
    return name;
  }

  /** The suffix of the next nested composite's locals: `1`, `2`, … */
  public nextLocalSuffix(): string {
    this.nodeCount += 1;
    return String(this.nodeCount);
  }
}
