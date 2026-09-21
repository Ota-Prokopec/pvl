import type { SchemaOptions } from "./schema.js";
import { StringSchema } from "./string.js";

export const pvl = {
  string: (options?: SchemaOptions): StringSchema => new StringSchema(options),
};
