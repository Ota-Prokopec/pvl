/** Rule: reports every JavaScript file ESLint is handed; the repo is TypeScript only. */
import { basename } from 'node:path';
import { createRule } from '../utils.ts';

export const noJavascriptFiles = createRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'No `.js`, `.mjs` or `.cjs` file: the repo is TypeScript only.',
    },
    messages: {
      noJavascript: 'Rewrite `{{file}}` in TypeScript: JavaScript files are not allowed.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    return {
      Program: (node): void => {
        context.report({
          node,
          messageId: 'noJavascript',
          data: { file: basename(context.filename) },
        });
      },
    };
  },
});
