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
    const check = (declaration: TSESTree.VariableDeclaration, isExported: boolean): void => {
      if (declaration.kind !== 'const') {
        return;
      }
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== AST_NODE_TYPES.Identifier || declarator.init === null) {
          continue;
        }
        const value = isAsConst(declarator.init) ? declarator.init.expression : declarator.init;
        if (!isSingleLiteral(value)) {
          continue;
        }
        const name = declarator.id.name;
        constants.set(name, declarator.id);
        if (isExported) {
          exported.add(name);
        }
        if (!isUpperSnakeCase(name)) {
          context.report({ node: declarator.id, messageId: 'name', data: { name } });
        }
        if (!isAsConst(declarator.init)) {
          context.report({ node: declarator.init, messageId: 'asConst', data: { name } });
        }
      }
    };
    return {
      'Program > VariableDeclaration': (node: TSESTree.VariableDeclaration): void => {
        check(node, false);
      },
      'Program > ExportNamedDeclaration > VariableDeclaration': (
        node: TSESTree.VariableDeclaration,
      ): void => {
        check(node, true);
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
