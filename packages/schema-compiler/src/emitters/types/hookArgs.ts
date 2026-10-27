// What each hook of `Emitter` that a subclass overrides takes: the Schema it
// emits or spells for, and the target, call or class name it reads.
import type { Schema } from '../../schemas/schema.js';
import type { SchemaModifierCall } from '../../schemas/types/modifierCall.js';
import type { Scope } from '../../scope.js';
import type { CheckingTarget } from './schemaParts.js';

/** What `Emitter._emitSchemaCompositeParts` emits a composite's parts for: a Schema at the target it checks. */
export type EmitSchemaCompositePartsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
  /** Numbers its own locals first, then its children's. */
  scope: Scope;
};

/** What `Emitter._spellTypes` and `Emitter._spellFactoryTypes` spell types for: the Schema, as the methods chained before `before` left it. */
export type SpellTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** The first method whose effect is left out, as a Modifier sees the types the methods before it left; omitted, the whole chain, its `.transform()` included. */
  before?: SchemaModifierCall;
};

/** What `Emitter._spellParameterTypes` spells a method's parameter types for: the Schema, and the call. */
export type SpellParameterTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  call: SchemaModifierCall;
};

/** What `Emitter._emitShapeProperty` emits a compiled object's `shape` for. */
export type EmitShapePropertyArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** The name of its class, which names its Standalone Keys' classes: `PvlCompiledSchema0_1`. */
  className: string;
};

/** What `Emitter._emitElementProperty` emits a compiled array's `element` for. */
export type EmitElementPropertyArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** The name of its class, which names its marked element's class: `PvlCompiledSchema0_element`. */
  className: string;
};

/** What `Emitter.compilesMethod` looks an emitter method up by: the name of the Schema method it mirrors. */
export type CompilesMethodArgs = {
  name: string;
};
