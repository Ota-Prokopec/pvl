import type { SchemaOptions } from "./schemas/baseSchema.js";
import { BigintSchema } from "./schemas/bigintSchema.js";
import { BooleanSchema } from "./schemas/booleanSchema.js";
import { EnumSchema, type EnumSource } from "./schemas/enumSchema.js";
import { LiteralSchema, type LiteralValue } from "./schemas/literalSchema.js";
import { NumberSchema } from "./schemas/numberSchema.js";
import { StringSchema } from "./schemas/stringSchema.js";

export const pvl = {
  string: (options?: SchemaOptions): StringSchema => new StringSchema(options),
  number: (options?: SchemaOptions): NumberSchema => new NumberSchema(options),
  boolean: (options?: SchemaOptions): BooleanSchema =>
    new BooleanSchema(options),
  bigint: (options?: SchemaOptions): BigintSchema => new BigintSchema(options),
  literal: <Value extends LiteralValue>(
    value: Value,
    options?: SchemaOptions,
  ): LiteralSchema<Value> => new LiteralSchema(value, options),
  // `const Source` so a bare `pvl.enum(["A", "B"])` call site infers the
  // readonly tuple of literals rather than widening to `string[]`.
  enum: <const Source extends EnumSource>(
    source: Source,
    options?: SchemaOptions,
  ): EnumSchema<Source> => new EnumSchema(source, options),
};
