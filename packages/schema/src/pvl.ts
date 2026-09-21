import type { SchemaOptions } from "./schemas/baseSchema.js";
import { BigintSchema } from "./schemas/bigintSchema.js";
import { BooleanSchema } from "./schemas/booleanSchema.js";
import { NumberSchema } from "./schemas/numberSchema.js";
import { StringSchema } from "./schemas/stringSchema.js";

export const pvl = {
  string: (options?: SchemaOptions): StringSchema => new StringSchema(options),
  number: (options?: SchemaOptions): NumberSchema => new NumberSchema(options),
  boolean: (options?: SchemaOptions): BooleanSchema =>
    new BooleanSchema(options),
  bigint: (options?: SchemaOptions): BigintSchema => new BigintSchema(options),
};
