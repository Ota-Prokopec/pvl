/** Rule: no "Source Layout" heading in an `AGENTS.md`. */
import type { MarkdownRuleDefinition } from '@eslint/markdown';

export const noSourceLayoutHeading: MarkdownRuleDefinition = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'No "Source Layout" section in an `AGENTS.md`.',
    },
    messages: {
      sourceLayout:
        'Remove the "Source Layout" section: a file tree goes stale as soon as a file moves. Describe a file\'s purpose in a comment at the top of that file instead.',
    },
  },
  create: (context) => {
    return {
      heading: (node): void => {
        const text = context.sourceCode
          .getText(node)
          .replace(/^#+\s*/, '')
          .trim();
        if (/^source layout$/i.test(text)) {
          context.report({ node, messageId: 'sourceLayout' });
        }
      },
    };
  },
};
