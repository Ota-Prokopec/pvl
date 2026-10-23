/** Rule: import a Node built-in as a namespace named after its module, never by name or as a default. */
import * as module from 'node:module';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

const NODE_BUILTIN_PREFIX = 'node:' as const;

/**
 * The namespace a built-in is imported as: its module's name, without the
 * `node:` prefix, in camelCase.
 *
 * ```ts
 * nameNamespace('node:path')          // 'path'
 * nameNamespace('path')               // 'path'
 * nameNamespace('node:fs/promises')   // 'fsPromises'
 * nameNamespace('node:child_process') // 'childProcess'
 * ```
 */
const nameNamespace = (moduleSpecifier: string): string => {
  const moduleName = moduleSpecifier.startsWith(NODE_BUILTIN_PREFIX)
    ? moduleSpecifier.slice(NODE_BUILTIN_PREFIX.length)
    : moduleSpecifier;
  return moduleName.replace(/[/_]([a-z])/g, (_separator, letter: string) => letter.toUpperCase());
};

export const nodeBuiltinNamespaceImport = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Import a Node built-in as a namespace named after its module (`import * as fsPromises from "node:fs/promises"`) and call it through that namespace, so a call site shows where the function comes from.',
    },
    messages: {
      namespace:
        "Import `{{moduleSpecifier}}` as a namespace, `import * as {{namespaceName}} from '{{moduleSpecifier}}'`, and call it through `{{namespaceName}}.`, so a call site shows where the function comes from.",
      namespaceName:
        'Name the `{{moduleSpecifier}}` namespace `{{namespaceName}}`, after its module, instead of `{{localName}}`. Another name is allowed only when `{{namespaceName}}` clashes with another binding in this module.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    return {
      ImportDeclaration: (node): void => {
        const moduleSpecifier = node.source.value;
        if (!module.isBuiltin(moduleSpecifier)) {
          return;
        }
        const namespaceName = nameNamespace(moduleSpecifier);
        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportNamespaceSpecifier) {
            context.report({
              node,
              messageId: 'namespace',
              data: { moduleSpecifier, namespaceName },
            });
            return;
          }
          const localName = specifier.local.name;
          const clashes = context.sourceCode
            .getScope(specifier)
            .variables.some((variable): boolean => variable.name === namespaceName);
          if (localName !== namespaceName && !clashes) {
            context.report({
              node: specifier,
              messageId: 'namespaceName',
              data: { moduleSpecifier, namespaceName, localName },
            });
          }
        }
      },
    };
  },
});
