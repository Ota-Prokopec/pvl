/** Rule: no `as` renaming in an import unless the imported name clashes with another binding in the module. */
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

export const noImportAlias = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Import a binding under its own name; an `as` alias is allowed only when the name clashes with another binding in the module.',
    },
    messages: {
      noAlias:
        'Import `{{imported}}` under its own name. An `as` alias is allowed only when `{{imported}}` clashes with another binding in this module.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    return {
      ImportSpecifier: (node): void => {
        if (
          node.imported.type !== AST_NODE_TYPES.Identifier ||
          node.imported.name === node.local.name
        ) {
          return;
        }
        const imported = node.imported.name;
        const scope = context.sourceCode.getScope(node);
        const clashes = scope.variables.some((variable): boolean => variable.name === imported);
        if (!clashes) {
          context.report({ node, messageId: 'noAlias', data: { imported } });
        }
      },
    };
  },
});
