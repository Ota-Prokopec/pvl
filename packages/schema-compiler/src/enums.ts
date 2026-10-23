// The fixed sets of named values the compiler uses internally: the `pvl.*`
// factories it reads a Schema from, the Modifier methods chained onto one,
// whether a spelled type admits `undefined`, and what a module specifier
// reaches. The diagnostics' own are in `diagnostics/enums.ts`.
import type { ValueOfEnum } from '@repo/types';

/** Every `pvl.*` factory the compiler reads a Schema from, valued by its name on `pvl`. `union` is read but can't be compiled yet. */
export const SCHEMA_FACTORY = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  BIGINT: 'bigint',
  LITERAL: 'literal',
  ENUM: 'enum',
  OBJECT: 'object',
  ARRAY: 'array',
  UNION: 'union',
} as const;

export type SchemaFactory = ValueOfEnum<typeof SCHEMA_FACTORY>;

/** Every Modifier method the compiler reads off a Schema's call chain, valued by its name on the Schema: the pre-modifiers first, then the post-modifiers (ADR-0010). */
export const MODIFIER_NAME = {
  OPTIONAL: 'optional',
  NULLABLE: 'nullable',
  COERCE: 'coerce',
  MIN: 'min',
  MAX: 'max',
  LENGTH: 'length',
  INT: 'int',
  STRICT: 'strict',
  PASSTHROUGH: 'passthrough',
  REFINE: 'refine',
  TRANSFORM: 'transform',
} as const;

export type ModifierName = ValueOfEnum<typeof MODIFIER_NAME>;

/** What a module specifier written in a scanned module reaches, as the mirror sees it. */
export const SPECIFIER_TARGET_KIND = {
  /** A scanned file, so its mirrored module. */
  MIRRORED: 'MIRRORED',
  /** An application file that wasn't scanned, so the original file. */
  REPOSITORY: 'REPOSITORY',
  /** A package, or nothing at all. */
  UNRESOLVED: 'UNRESOLVED',
} as const;

export type SpecifierTargetKind = ValueOfEnum<typeof SPECIFIER_TARGET_KIND>;

/** Whether a spelled type admits `undefined`, which decides whether an object key of that type may be left out. */
export const UNDEFINEDNESS = {
  /** It never does: `string`. */
  NEVER: 'NEVER',
  /** It always does: `string | undefined`, `unknown`. */
  ALWAYS: 'ALWAYS',
  /** It does when a type parameter does, which only TypeScript decides once it is inferred: a `.transform()`'s `TArg0Output`. */
  CONDITIONAL: 'CONDITIONAL',
} as const;

export type Undefinedness = ValueOfEnum<typeof UNDEFINEDNESS>;
