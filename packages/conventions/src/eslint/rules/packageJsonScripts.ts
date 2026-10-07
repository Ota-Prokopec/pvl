/**
 * Rule: no `package.json` script chains steps with `&&`, `||`, `;` or `&`; a
 * script using `run-s`/`run-p` needs `npm-run-all` in the same package's
 * `devDependencies`.
 */
import type { JSONRuleDefinition } from '@eslint/json';
import { findMember, rootObject } from '../jsonUtils.ts';

const CHAIN = /&&|\|\||;|(?<![&>])&(?![&>])/;
const RUN_ALL = /(?:^|\s)run-[sp](?:\s|$)/;

export const packageJsonScripts: JSONRuleDefinition = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'No `package.json` script chains steps with `&&`, `||`, `;` or `&`; `run-s`/`run-p` need `npm-run-all` in the same package.',
    },
    messages: {
      chain:
        'Split the script `{{name}}` into named steps composed with `run-s` (sequential) or `run-p` (parallel) from `npm-run-all`, instead of chaining them with `&&`, `||`, `;` or `&`.',
      runAll:
        "Add `npm-run-all` to this package's own `devDependencies`: the script `{{name}}` uses `run-s`/`run-p`.",
    },
  },
  create: (context) => {
    return {
      Document: (document): void => {
        const root = rootObject(document);
        const scripts = root === undefined ? undefined : findMember(root, 'scripts');
        if (root === undefined || scripts?.value.type !== 'Object') {
          return;
        }
        const devDependencies = findMember(root, 'devDependencies');
        const hasRunAll =
          devDependencies?.value.type === 'Object' &&
          findMember(devDependencies.value, 'npm-run-all') !== undefined;
        for (const script of scripts.value.members) {
          if (script.value.type !== 'String' || script.name.type !== 'String') {
            continue;
          }
          const data = { name: script.name.value };
          if (CHAIN.test(script.value.value)) {
            context.report({ loc: script.value.loc, messageId: 'chain', data });
          }
          if (RUN_ALL.test(script.value.value) && !hasRunAll) {
            context.report({ loc: script.value.loc, messageId: 'runAll', data });
          }
        }
      },
    };
  },
};
