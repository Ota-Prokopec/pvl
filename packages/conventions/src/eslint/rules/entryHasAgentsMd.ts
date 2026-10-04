/** Rule: every `apps/*` and `packages/*` entry has an `AGENTS.md`. Runs on the entry's `package.json`. */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { JSONRuleDefinition } from '@eslint/json';
import { findEntry } from '../utils.ts';

export const entryHasAgentsMd: JSONRuleDefinition = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Every `apps/*` and `packages/*` entry has an `AGENTS.md`.',
    },
    messages: {
      missing:
        'Add an `AGENTS.md` to `{{entry}}` describing its purpose, technology and conventions.',
    },
  },
  create: (context) => {
    return {
      Document: (document): void => {
        const entry = findEntry(context.filename);
        if (entry !== undefined && !existsSync(join(dirname(context.filename), 'AGENTS.md'))) {
          context.report({ loc: document.loc, messageId: 'missing', data: { entry } });
        }
      },
    };
  },
};
