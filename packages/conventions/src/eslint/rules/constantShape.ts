/**
 * Rule: a constant (a module-level `const` initialised with one literal) is
 * UPPER_SNAKE_CASE, ends in `as const`, and when exported lives in a
 * `consts.ts`.
 */
import { basename } from 'node:path';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule, isUpperSnakeCase } from '../utils.ts';

const isSingleLiteral = (node: TSESTree.Node): boolean => {
  switch (node.type) {
    case AST_NODE_TYPES.Literal:
      return !('regex' in node) && node.value !== null;
    case AST_NODE_TYPES.TemplateLiteral:
      return node.expressions.length === 0;
    case AST_NODE_TYPES.UnaryExpression:
      return node.operator === '-' && isSingleLiteral(node.argument);
    default:
      return false;
  }
};

const isAsConst = (node: TSESTree.Expression): node is TSESTree.TSAsExpression => {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression &&
    node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    node.typeAnnotation.typeName.name === 'const'
  );
};

// A constant `declaration` declares: an identifier initialised with one
// literal, `as const` or not.
type Constant = {
  id: TSESTree.Identifier;
  init: TSESTree.Expression;
};

const readConstants = (declaration: TSESTree.VariableDeclaration): Constant[] => {
  if (declaration.kind !== 'const') {
    return [];
  }
  return declaration.declarations.flatMap((declarator) => {
    if (declarator.id.type !== AST_NODE_TYPES.Identifier || declarator.init === null) {
      return [];
    }
    const value = isAsConst(declarator.init) ? declarator.init.expression : declarator.init;
    return isSingleLiteral(value) ? [{ id: declarator.id, init: declarator.init }] : [];
  });
};

export const constantShape = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'A module-level `const` initialised with one literal is UPPER_SNAKE_CASE, ends in `as const`, and when exported lives in a `consts.ts`.',
    },
    messages: {
      name: 'Name the constant `{{name}}` in UPPER_SNAKE_CASE.',
      asConst: 'End the constant `{{name}}` with `as const`.',
      file: 'Move the exported constant `{{name}}` into a `consts.ts` file.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    const constants = new Map<string, TSESTree.Identifier>();
    const exported = new Set<string>();
    return {
      'Program > VariableDeclaration, Program > ExportNamedDeclaration > VariableDeclaration': (
        node: TSESTree.VariableDeclaration,
      ): void => {
        const isExported = node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration;
        for (const { id, init } of readConstants(node)) {
          constants.set(id.name, id);
          if (isExported) {
            exported.add(id.name);
          }
          if (!isUpperSnakeCase(id.name)) {
            context.report({ node: id, messageId: 'name', data: { name: id.name } });
          }
          if (!isAsConst(init)) {
            context.report({ node: init, messageId: 'asConst', data: { name: id.name } });
          }
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
        if (basename(context.filename) === 'consts.ts') {
          return;
        }
        for (const name of exported) {
          const node = constants.get(name);
          if (node !== undefined) {
            context.report({ node, messageId: 'file', data: { name } });
          }
        }
      },
    };
  },
});
