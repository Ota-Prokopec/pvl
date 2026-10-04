/**
 * Rule: an enum (an `as const` object literal whose every value is a string or
 * number literal) has an UPPER_SNAKE_CASE name and UPPER_SNAKE_CASE keys.
 */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule, isUpperSnakeCase } from '../utils.ts';

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

const keyName = (property: TSESTree.Property): string | undefined => {
  if (property.computed) {
    return undefined;
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return property.key.type === AST_NODE_TYPES.Literal ? String(property.key.value) : undefined;
};

export const enumShape = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'An enum (an `as const` object literal of string or number literals) has an UPPER_SNAKE_CASE name and UPPER_SNAKE_CASE keys.',
    },
    messages: {
      name: 'Name the enum `{{name}}` in UPPER_SNAKE_CASE.',
      key: 'Name the enum key `{{key}}` in UPPER_SNAKE_CASE. Only its value may follow an external format.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    return {
      VariableDeclarator: (node): void => {
        const object = asConstObject(node.init);
        if (
          object === undefined ||
          node.id.type !== AST_NODE_TYPES.Identifier ||
          object.properties.length === 0
        ) {
          return;
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
        if (!isEnum) {
          return;
        }
        if (!isUpperSnakeCase(node.id.name)) {
          context.report({ node: node.id, messageId: 'name', data: { name: node.id.name } });
        }
        for (const property of properties) {
          const key = keyName(property) ?? '';
          if (!isUpperSnakeCase(key)) {
            context.report({ node: property.key, messageId: 'key', data: { key } });
          }
        }
      },
    };
  },
});
