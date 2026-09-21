import type { SchemaOptions } from "./schemas/baseSchema.js";
import { StringSchema } from "./schemas/stringSchema.js";

export const pvl = {
  string: (options?: SchemaOptions): StringSchema => new StringSchema(options),
};
