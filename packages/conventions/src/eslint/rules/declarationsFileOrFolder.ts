/**
 * Rule: a directory keeps its constants, enums or types in either a
 * `<kind>.ts` file or a `<kind>/` folder, never both.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRule, findDeclarationsOwner } from '../utils.ts';

export const declarationsFileOrFolder = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'A directory keeps its `consts`, `enums` or `types` in either a `<kind>.ts` file or a `<kind>/` folder, never both.',
    },
    messages: {
      both: 'Merge `{{kind}}.ts` and the `{{kind}}/` folder of `{{directory}}` into one of them: a `{{kind}}.ts`, or a `{{kind}}/` folder of files each holding one meaning.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    return {
      Program: (program): void => {
        for (const kind of ['consts', 'enums', 'types']) {
          const directory = findDeclarationsOwner(context.filename, kind);
          if (
            directory !== undefined &&
            fs.existsSync(path.join(directory, `${kind}.ts`)) &&
            fs.existsSync(path.join(directory, kind))
          ) {
            context.report({ node: program, messageId: 'both', data: { kind, directory } });
          }
        }
      },
    };
  },
});
