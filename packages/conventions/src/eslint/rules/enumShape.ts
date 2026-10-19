/**
 * Rule: an enum (an `as const` object literal whose every value is a string or
 * number literal) has an UPPER_SNAKE_CASE name and UPPER_SNAKE_CASE keys, and
 * when exported lives in an `enums.ts`.
 */
import { basename } from 'node:path';
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

// The enum's properties when `init` is an enum, `undefined` otherwise.
//
//   { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const  // [OWNER, MEMBER]
//   { depth: 1, name: foo() } as const             // undefined: `foo()` isn't a literal
//   {} as const                                    // undefined: empty
//   { OWNER: 'OWNER' }                             // undefined: not `as const`
const readEnumProperties = (init: TSESTree.Expression | null): TSESTree.Property[] | undefined => {
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

export const enumShape = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'An enum (an `as const` object literal of string or number literals) has an UPPER_SNAKE_CASE name and UPPER_SNAKE_CASE keys, and when exported lives in an `enums.ts`.',
    },
    messages: {
      name: 'Name the enum `{{name}}` in UPPER_SNAKE_CASE.',
      key: 'Name the enum key `{{key}}` in UPPER_SNAKE_CASE. Only its value may follow an external format.',
      file: 'Move the exported enum `{{name}}` into an `enums.ts` file.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    const moduleEnums = new Map<string, TSESTree.Identifier>();
    const exported = new Set<string>();
    return {
      VariableDeclarator: (node): void => {
        const properties = readEnumProperties(node.init);
        if (properties === undefined || node.id.type !== AST_NODE_TYPES.Identifier) {
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
        const declarationParent = node.parent.parent;
        if (declarationParent.type === AST_NODE_TYPES.Program) {
          moduleEnums.set(node.id.name, node.id);
        } else if (
          declarationParent.type === AST_NODE_TYPES.ExportNamedDeclaration &&
          declarationParent.parent.type === AST_NODE_TYPES.Program
        ) {
          moduleEnums.set(node.id.name, node.id);
          exported.add(node.id.name);
        }
      },
      'Program > ExportNamedDeclaration > ExportSpecifier': (
        node: TSESTree.ExportSpecifier,
      ): void => {
        if (node.local.type === AST_NODE_TYPES.Identifier) {
          exported.add(node.local.name);
        }
      },
      'Program:exit': (): void => {
        if (basename(context.filename) === 'enums.ts') {
          return;
        }
        for (const name of exported) {
          const node = moduleEnums.get(name);
          if (node !== undefined) {
            context.report({ node, messageId: 'file', data: { name } });
          }
        }
      },
    };
  },
});
