/** Rule: `type`, never `interface`, unless the interface needs polymorphic `this` or a class in the same file implements it. */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

const usesThisType = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  if ('type' in node && node.type === AST_NODE_TYPES.TSThisType) {
    return true;
  }
  return Object.entries(node).some(([key, value]): boolean => {
    if (key === 'parent') {
      return false;
    }
    return Array.isArray(value) ? value.some(usesThisType) : usesThisType(value);
  });
};

export const noInterface = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Use `type`, never `interface`, unless the interface body uses polymorphic `this` or a class in the same file implements it.',
    },
    messages: {
      useType:
        'Declare `{{name}}` with `type` instead of `interface`. An interface is allowed only when its body uses polymorphic `this` or a class in this file implements it.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    const interfaces: TSESTree.TSInterfaceDeclaration[] = [];
    const implemented = new Set<string>();
    return {
      TSInterfaceDeclaration: (node): void => {
        if (!usesThisType(node.body)) {
          interfaces.push(node);
        }
      },
      TSClassImplements: (node): void => {
        if (node.expression.type === AST_NODE_TYPES.Identifier) {
          implemented.add(node.expression.name);
        }
      },
      'Program:exit': (): void => {
        for (const node of interfaces) {
          if (!implemented.has(node.id.name)) {
            context.report({ node: node.id, messageId: 'useType', data: { name: node.id.name } });
          }
        }
      },
    };
  },
});
