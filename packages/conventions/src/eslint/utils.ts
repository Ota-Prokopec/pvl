/** Helpers the rules share. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/** Builds a typescript-eslint rule; every rule here documents itself through `meta.docs.description`. */
export const createRule = ESLintUtils.RuleCreator.withoutDocs;

export const isUpperSnakeCase = (name: string): boolean => {
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name);
};

/**
 * The directory whose `kind` declarations (`consts`, `enums`, `types`)
 * `filename` holds: its own for a `<kind>.ts`, its parent's for a file
 * directly inside a `<kind>/` folder, else `undefined`.
 */
export const findDeclarationsOwner = (filename: string, kind: string): string | undefined => {
  const directory = path.dirname(filename);
  if (path.basename(filename) === `${kind}.ts`) {
    return directory;
  }
  return path.basename(directory) === kind ? path.dirname(directory) : undefined;
};

/** The `name` in the nearest `package.json` above `filename`, or `undefined` when none is found. */
export const findPackageName = (filename: string): string | undefined => {
  let directory = path.dirname(filename);
  while (path.dirname(directory) !== directory) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      return typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        typeof parsed.name === 'string'
        ? parsed.name
        : undefined;
    }
    directory = path.dirname(directory);
  }
  return undefined;
};

/**
 * The workspace entry (`apps/<name>` or `packages/<name>`) whose own
 * `package.json` is `filename`, or `undefined` for any other file.
 */
export const findEntry = (filename: string): string | undefined => {
  const match = /(?:^|[\\/])((?:apps|packages)[\\/][^\\/]+)[\\/]package\.json$/.exec(filename);
  return match?.[1];
};

const isNumberOrStringLiteral = (node: TSESTree.Node): boolean => {
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '-') {
    return isNumberOrStringLiteral(node.argument);
  }
  return (
    node.type === AST_NODE_TYPES.Literal &&
    (typeof node.value === 'string' || typeof node.value === 'number')
  );
};

/** The object literal an `as const` (optionally followed by `satisfies`) wraps, or `undefined`. */
const asConstObject = (init: TSESTree.Expression | null): TSESTree.ObjectExpression | undefined => {
  const unwrapped = init?.type === AST_NODE_TYPES.TSSatisfiesExpression ? init.expression : init;
  if (
    unwrapped?.type === AST_NODE_TYPES.TSAsExpression &&
    unwrapped.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    unwrapped.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    unwrapped.typeAnnotation.typeName.name === 'const' &&
    unwrapped.expression.type === AST_NODE_TYPES.ObjectExpression
  ) {
    return unwrapped.expression;
  }
  return undefined;
};

export const keyName = (property: TSESTree.Property): string | undefined => {
  if (property.computed) {
    return undefined;
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined;
};

// The enum's properties when `init` is an enum, `undefined` otherwise.
//
//   { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const  // [OWNER, MEMBER]
//   { depth: 1, name: foo() } as const             // undefined: `foo()` isn't a literal
//   {} as const                                    // undefined: empty
//   { OWNER: 'OWNER' }                             // undefined: not `as const`
export const readEnumProperties = (
  init: TSESTree.Expression | null,
): TSESTree.Property[] | undefined => {
  const object = asConstObject(init);
  if (object === undefined || object.properties.length === 0) {
    return undefined;
  }
  const properties = object.properties.filter(
    (property): property is TSESTree.Property => property.type === AST_NODE_TYPES.Property,
  );
  const isEnum =
    properties.length === object.properties.length &&
    properties.every(
      (property): boolean =>
        keyName(property) !== undefined && isNumberOrStringLiteral(property.value),
    );
  return isEnum ? properties : undefined;
};
