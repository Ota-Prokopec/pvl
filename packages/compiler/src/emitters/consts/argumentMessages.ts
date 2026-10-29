// Each Emitter's `argumentMessages`, which its checks read too, so a check
// and the constructor building a Runtime Argument's message share one.
import {
  ARRAY_SCHEMA_ISSUE_MESSAGE,
  BIGINT_SCHEMA_ISSUE_MESSAGE,
  NUMBER_SCHEMA_ISSUE_MESSAGE,
  STRING_SCHEMA_ISSUE_MESSAGE,
  type ArrayInterpretedSchema,
  type BigintInterpretedSchema,
  type NumberInterpretedSchema,
  type StringInterpretedSchema,
} from '@pcvl/schema';
import type { ArgumentMessagesOf } from '../types/methodTables.js';

/** `StringSchemaEmitter.argumentMessages`: the default messages of `.min()`, `.max()` and `.length()`, naming their bound. */
export const STRING_ARGUMENT_MESSAGES = {
  min: STRING_SCHEMA_ISSUE_MESSAGE.min,
  max: STRING_SCHEMA_ISSUE_MESSAGE.max,
  length: STRING_SCHEMA_ISSUE_MESSAGE.length,
} satisfies ArgumentMessagesOf<StringInterpretedSchema>;

/** `ArraySchemaEmitter.argumentMessages`: the default messages of `.min()`, `.max()` and `.length()`, naming their bound. */
export const ARRAY_ARGUMENT_MESSAGES = {
  min: ARRAY_SCHEMA_ISSUE_MESSAGE.min,
  max: ARRAY_SCHEMA_ISSUE_MESSAGE.max,
  length: ARRAY_SCHEMA_ISSUE_MESSAGE.length,
} satisfies ArgumentMessagesOf<ArrayInterpretedSchema>;

/** `NumberSchemaEmitter.argumentMessages`: the default messages of `.min()` and `.max()`, naming their bound. */
export const NUMBER_ARGUMENT_MESSAGES = {
  min: NUMBER_SCHEMA_ISSUE_MESSAGE.min,
  max: NUMBER_SCHEMA_ISSUE_MESSAGE.max,
} satisfies ArgumentMessagesOf<NumberInterpretedSchema>;

/** `BigintSchemaEmitter.argumentMessages`: the default messages of `.min()` and `.max()`, naming their bound. */
export const BIGINT_ARGUMENT_MESSAGES = {
  min: BIGINT_SCHEMA_ISSUE_MESSAGE.min,
  max: BIGINT_SCHEMA_ISSUE_MESSAGE.max,
} satisfies ArgumentMessagesOf<BigintInterpretedSchema>;
