// How a Compiled Schema's class expression is composed from what its
// emitter emitted for it (`Emitter.emitCompiledSchema`): its types, its
// `shape` or marked `element`, and its parts, with its Runtime Arguments.
import { Frame } from '../../frame/frame.js';
import { RuntimeArgument } from '../../schemas/runtimeArgument.js';
import type { SchemaTypes } from '../../schemas/schemaTypes.js';
import type { CompiledSchema, EmitCompiledSchemaArgs } from '../types/compiledSchema.js';
import type { SchemaParts } from '../types/schemaParts.js';
import type {
  EmittedElementProperty,
  EmittedShapeProperty,
} from '../types/standaloneProperties.js';

/** What {@link composeCompiledSchema} composes a Compiled Schema from: what `Emitter.emitCompiledSchema` was called with, and what its emitter emitted for the Schema. */
type ComposeCompiledSchemaArgs = EmitCompiledSchemaArgs & {
  /** The Schema's `Input` and `Output` types. */
  types: SchemaTypes;
  /** Its `shape` or marked `element`; `undefined` for a Schema exposing neither. */
  shapeOrElementProperty: EmittedShapeProperty | EmittedElementProperty | undefined;
  /** Its parts, emitted at `Frame.rootCheckingTarget`. */
  parts: SchemaParts;
};

/**
 * A Compiled Schema, with the type it is cast up to, composed by the Frame
 * from `parts`, `types` and `shapeOrElementProperty`, with `schema`'s
 * Runtime Arguments: at the root (`hoistedNameByExpression` set), each
 * passed as written or by the name of the `const` it is hoisted into, and
 * the class generic in the type parameter of each `.transform()`'s output;
 * nested, each passed as the parent holds it (`this.arg0`), and generic in
 * nothing.
 *
 * ```ts
 * composeCompiledSchema({ schema: <pvl.string().max(max)>, className: 'PvlCompiledSchema0', indentation: '', hoistedNameByExpression: new Map(), types, shapeOrElementProperty: undefined, parts })
 * // { expression: '(new (class PvlCompiledSchema0 implements PvlSchema<string, string> { … })(max) as PvlSchema<string, string>)', type: 'PvlSchema<string, string>' }
 * ```
 */
export const composeCompiledSchema = ({
  schema,
  className,
  indentation,
  hoistedNameByExpression,
  types,
  shapeOrElementProperty,
  parts,
}: ComposeCompiledSchemaArgs): CompiledSchema => {
  const runtimeArgumentParameters = RuntimeArgument.getArgumentParameters({
    schema,
    hoistedNameByExpression,
  });

  const compiledSchemaType = Frame.spellCompiledSchemaType({
    types,
    isStandalone: schema.isStandalone,
    shapeOrElementType: shapeOrElementProperty?.type,
  });

  const expression = Frame.composeSchema({
    className,
    types,
    compiledSchemaType,
    isStandalone: schema.isStandalone,
    // In the order their Runtime Arguments are numbered.
    typeParameters:
      hoistedNameByExpression === undefined
        ? []
        : runtimeArgumentParameters.flatMap(({ typeParameter }) =>
            typeParameter === undefined ? [] : [typeParameter],
          ),
    indentation,
    runtimeArguments: runtimeArgumentParameters,
    composedShapeOrElement: shapeOrElementProperty?.composed,
    parts,
  });

  return { expression, type: compiledSchemaType };
};
