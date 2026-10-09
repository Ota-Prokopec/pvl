// The emitters of the Schemas a field or an element may be built with until
// nested composites are compiled (#51). Kept apart from the composite
// emitters, which inline a field's or an element's checks through it, so
// they don't import themselves.
import { SCHEMA_FACTORY, type SchemaFactory } from '../enums.js';
import type { SchemaModel } from '../schemaModel.js';
import { BigintSchemaEmitter } from './bigintSchemaEmitter.js';
import { BooleanSchemaEmitter } from './booleanSchemaEmitter.js';
import type { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { EnumSchemaEmitter } from './enumSchemaEmitter.js';
import { LiteralSchemaEmitter } from './literalSchemaEmitter.js';
import { NumberSchemaEmitter } from './numberSchemaEmitter.js';
import { StringSchemaEmitter } from './stringSchemaEmitter.js';

/** Every flat Schema's emitter, by the factory whose Schema it compiles. */
export const FLAT_EMITTER_BY_FACTORY: Readonly<
  Partial<Record<SchemaFactory, typeof ChainableSchemaEmitter>>
> = {
  [SCHEMA_FACTORY.STRING]: StringSchemaEmitter,
  [SCHEMA_FACTORY.NUMBER]: NumberSchemaEmitter,
  [SCHEMA_FACTORY.BOOLEAN]: BooleanSchemaEmitter,
  [SCHEMA_FACTORY.BIGINT]: BigintSchemaEmitter,
  [SCHEMA_FACTORY.LITERAL]: LiteralSchemaEmitter,
  [SCHEMA_FACTORY.ENUM]: EnumSchemaEmitter,
};

/**
 * The emitter of a field's or an element's Schema. Only called on a
 * SchemaModel `CompiledSchemaWriter.findUncompilableDiagnostics` found nothing in; throws for a
 * nested composite, which is a bug in the compiler, never a user error.
 *
 * ```ts
 * findFlatEmitter(<pvl.string()>)          // StringSchemaEmitter
 * findFlatEmitter(<pvl.array(pvl.string())>) // throws
 * ```
 */
export const findFlatEmitter = (schema: SchemaModel): typeof ChainableSchemaEmitter => {
  const emitter = FLAT_EMITTER_BY_FACTORY[schema.factory];
  if (emitter === undefined) {
    throw new Error(`A pvl.${schema.factory}() can't be inlined as a flat Schema.`);
  }
  return emitter;
};
