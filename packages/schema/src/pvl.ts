import { ArraySchema, type ArrayItem } from './schemas/arraySchema.js';
import type { SchemaOptions } from './schemas/baseSchema.js';
import { BigintSchema } from './schemas/bigintSchema.js';
import { BooleanSchema } from './schemas/booleanSchema.js';
import { EnumSchema, type EnumSource } from './schemas/enumSchema.js';
import { LiteralSchema, type LiteralValue } from './schemas/literalSchema.js';
import { NumberSchema } from './schemas/numberSchema.js';
import { ObjectSchema, type ObjectShape, type UnknownKeys } from './schemas/objectSchema.js';
import { StringSchema } from './schemas/stringSchema.js';
import { UnionSchema, type UnionMembers } from './schemas/unionSchema.js';

/**
 * The schema types `pvl.compile()` accepts — composite schemas only.
 * Compiling a single primitive has no tree to flatten, so a bare primitive
 * like `pvl.string()` is rejected at the type level rather than accepted
 * and silently doing nothing useful.
 */
export type CompileCandidate = ObjectSchema<ObjectShape, UnknownKeys> | ArraySchema<ArrayItem>;

export const pvl = {
  string: (options?: SchemaOptions): StringSchema => new StringSchema(options),
  number: (options?: SchemaOptions): NumberSchema => new NumberSchema(options),
  boolean: (options?: SchemaOptions): BooleanSchema => new BooleanSchema(options),
  bigint: (options?: SchemaOptions): BigintSchema => new BigintSchema(options),
  literal: <Value extends LiteralValue>(
    value: Value,
    options?: SchemaOptions,
  ): LiteralSchema<Value> => new LiteralSchema(value, options),
  object: <Shape extends ObjectShape>(shape: Shape, options?: SchemaOptions): ObjectSchema<Shape> =>
    new ObjectSchema(shape, options),
  array: <Item extends ArrayItem>(item: Item, options?: SchemaOptions): ArraySchema<Item> =>
    new ArraySchema(item, options),
  // `const Source` so a bare `pvl.enum(["A", "B"])` call site infers the
  // readonly tuple of literals rather than widening to `string[]`.
  enum: <const Source extends EnumSource>(
    source: Source,
    options?: SchemaOptions,
  ): EnumSchema<Source> => new EnumSchema(source, options),
  // `const Members` so a bare `pvl.union([...])` call site infers the
  // readonly tuple of member schemas rather than widening to their union.
  union: <const Members extends UnionMembers>(
    members: Members,
    options?: SchemaOptions,
  ): UnionSchema<Members> => new UnionSchema(members, options),
  // Identity function pre-compilation (see @pvl/schema-compiler's AGENTS.md
  // for what happens once a call site has been through the compiler): marks
  // a composite schema as a candidate for ahead-of-time compilation without
  // altering its runtime behavior, so a schema file using it still validates
  // correctly via the normal interpreted path before the compiler runs.
  compile: <Candidate extends CompileCandidate>(schema: Candidate): Candidate => schema,
};
