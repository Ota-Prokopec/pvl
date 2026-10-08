/** Rule: no regular expressions, for code on the validation hot path. */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

// Whether a call or `new` expression builds a regular expression through
// the global `RegExp`.
//
//   new RegExp('^a+$')        // true
//   RegExp(pattern, 'g')      // true
//   new Registry()            // false
//   window.RegExp('a')        // false: only a bare `RegExp` is caught
const callsRegExp = (node: TSESTree.CallExpression | TSESTree.NewExpression): boolean => {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'RegExp';
};

export const noRegex = createRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'No regex literals and no `RegExp`: validators stay on the fast, non-regex path.',
    },
    messages: {
      noRegex:
        'Remove this regular expression: validators stay on the fast, non-regex path. Use plain comparisons instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => ({
    Literal: (node): void => {
      if ('regex' in node) {
        context.report({ node, messageId: 'noRegex' });
      }
    },
    'CallExpression, NewExpression': (
      node: TSESTree.CallExpression | TSESTree.NewExpression,
    ): void => {
      if (callsRegExp(node)) {
        context.report({ node, messageId: 'noRegex' });
      }
    },
  }),
});
