/** Rule: every `package.json` declares `"type": "module"`. */
import type { JSONRuleDefinition } from '@eslint/json';
import { findMember, rootObject } from '../jsonUtils.ts';

export const packageJsonModuleType: JSONRuleDefinition = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Every `package.json` declares `"type": "module"`.',
    },
    messages: {
      moduleType: 'Set `"type": "module"` in this `package.json`: the repo is ESM only.',
    },
  },
  create: (context) => {
    return {
      Document: (document): void => {
        const root = rootObject(document);
        const type = root === undefined ? undefined : findMember(root, 'type');
        if (type?.value.type !== 'String' || type.value.value !== 'module') {
          context.report({ loc: (type ?? document).loc, messageId: 'moduleType' });
        }
      },
    };
  },
};
