/** Rule: every `tsconfig*.json` extends `@repo/typescript-config/*` or a sibling tsconfig. */
import type { JSONRuleDefinition } from '@eslint/json';
import { findMember, rootObject } from '../jsonUtils.ts';

const isAllowedBase = (base: string): boolean => {
  return base.startsWith('@repo/typescript-config/') || /^\.\/tsconfig[^/]*\.json$/.test(base);
};

export const tsconfigExtends: JSONRuleDefinition = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every `tsconfig*.json` extends `@repo/typescript-config/*` or a sibling `tsconfig*.json`.',
    },
    messages: {
      extends:
        'Extend `@repo/typescript-config/<base>.json` or a sibling `./tsconfig*.json` instead of restating compiler options.',
    },
  },
  create: (context) => {
    return {
      Document: (document): void => {
        const root = rootObject(document);
        const base = root === undefined ? undefined : findMember(root, 'extends');
        if (base?.value.type !== 'String' || !isAllowedBase(base.value.value)) {
          context.report({ loc: (base ?? document).loc, messageId: 'extends' });
        }
      },
    };
  },
};
