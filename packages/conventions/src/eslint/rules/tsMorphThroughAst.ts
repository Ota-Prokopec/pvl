/** Rule: match ts-morph nodes through the compiler's AST helpers, not `Node.is…` type guards. */
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

export const tsMorphThroughAst = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'No ts-morph `Node.is…` type guards outside the AST helpers: domain code matches syntax through `GenericAst` and `PvlAst`.',
    },
    messages: {
      throughAst:
        'Match this node through `GenericAst` or `PvlAst` (`src/ast/`) instead of `Node.{{name}}`, adding a helper there when none fits.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    // Whether `Node` is imported from ts-morph here; another `Node` (the DOM's) is left alone.
    let importsTsMorphNode = false;

    return {
      ImportDeclaration: (node): void => {
        if (node.source.value !== 'ts-morph') {
          return;
        }
        importsTsMorphNode ||= node.specifiers.some(
          (specifier) =>
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.importKind !== 'type' &&
            specifier.imported.type === AST_NODE_TYPES.Identifier &&
            specifier.imported.name === 'Node',
        );
      },
      MemberExpression: (node): void => {
        if (
          importsTsMorphNode &&
          node.object.type === AST_NODE_TYPES.Identifier &&
          node.object.name === 'Node' &&
          node.property.type === AST_NODE_TYPES.Identifier &&
          node.property.name.startsWith('is')
        ) {
          context.report({ node, messageId: 'throughAst', data: { name: node.property.name } });
        }
      },
    };
  },
});
