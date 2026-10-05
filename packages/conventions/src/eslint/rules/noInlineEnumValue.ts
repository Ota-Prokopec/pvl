/** Rule: derive an enum's value union with `ValueOfEnum` from `@repo/types`, never inline or re-declared. */
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule, findPackageName } from '../utils.ts';

const TYPES_PACKAGE = '@repo/types' as const;

export const noInlineEnumValue = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Derive an enum value union with `ValueOfEnum` from `@repo/types`: no inline `typeof X[keyof typeof X]` and no local `ValueOfEnum`.',
    },
    messages: {
      inline:
        'Use `ValueOfEnum<typeof X>` from `@repo/types` instead of an inline `typeof X[keyof typeof X]`.',
      redeclared: 'Import `ValueOfEnum` from `@repo/types` instead of declaring a local copy.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    return {
      TSIndexedAccessType: (node): void => {
        if (
          node.objectType.type === AST_NODE_TYPES.TSTypeQuery &&
          node.indexType.type === AST_NODE_TYPES.TSTypeOperator &&
          node.indexType.operator === 'keyof' &&
          node.indexType.typeAnnotation?.type === AST_NODE_TYPES.TSTypeQuery
        ) {
          context.report({ node, messageId: 'inline' });
        }
      },
      TSTypeAliasDeclaration: (node): void => {
        if (node.id.name === 'ValueOfEnum' && findPackageName(context.filename) !== TYPES_PACKAGE) {
          context.report({ node: node.id, messageId: 'redeclared' });
        }
      },
    };
  },
});
