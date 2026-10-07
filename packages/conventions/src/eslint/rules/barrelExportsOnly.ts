/**
 * Rule: a barrel (any `index.ts` under `packages/<name>/src/`) holds only
 * `export * from '…'` statements and comments, and every sibling module or
 * directory is either re-exported or named in a comment.
 */
import { readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

const isBarrel = (filename: string): boolean => {
  return /[\\/]packages[\\/][^\\/]+[\\/]src[\\/](?:.+[\\/])?index\.tsx?$/.test(filename);
};

/** `./schemas/index.js` → `schemas`, `./issue.js` → `issue`. */
const exportedName = (source: string): string => {
  return source
    .replace(/^\.\//, '')
    .replace(/\/index(?:\.[cm]?[jt]sx?)?$/, '')
    .replace(/\.[cm]?[jt]sx?$/, '');
};

export const barrelExportsOnly = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "A barrel (`index.ts` under `packages/<name>/src/`) holds only `export * from '…'` statements and comments, and re-exports or names every sibling.",
    },
    messages: {
      onlyExportAll:
        "A barrel holds only `export * from '…'` statements and comments. Move this into its own module and re-export that module.",
      missingSibling:
        'Re-export `./{{name}}` from this barrel, or name `{{entry}}` in a comment saying why it is left out.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    if (!isBarrel(context.filename)) {
      return {};
    }
    return {
      Program: (program): void => {
        const exported = new Set<string>();
        for (const statement of program.body) {
          if (
            statement.type === AST_NODE_TYPES.ExportAllDeclaration &&
            statement.exportKind === 'value' &&
            statement.exported === null
          ) {
            exported.add(exportedName(statement.source.value));
          } else {
            context.report({ node: statement, messageId: 'onlyExportAll' });
          }
        }
        const comments = context.sourceCode
          .getAllComments()
          .map((comment): string => comment.value)
          .join('\n');
        const own = basename(context.filename);
        for (const sibling of readdirSync(dirname(context.filename), { withFileTypes: true })) {
          const isModule =
            sibling.isFile() && /\.tsx?$/.test(sibling.name) && !sibling.name.endsWith('.d.ts');
          if (sibling.name === own || (!isModule && !sibling.isDirectory())) {
            continue;
          }
          const name = sibling.name.replace(/\.tsx?$/, '');
          const entry = sibling.isDirectory() ? `${name}/` : sibling.name;
          if (!exported.has(name) && !comments.includes(entry)) {
            context.report({ node: program, messageId: 'missingSibling', data: { name, entry } });
          }
        }
      },
    };
  },
});
