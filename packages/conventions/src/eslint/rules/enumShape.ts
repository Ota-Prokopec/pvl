/**
 * Rule: an enum (an `as const` object literal whose every value is a string or
 * number literal) has an UPPER_SNAKE_CASE name and UPPER_SNAKE_CASE keys, and
 * when exported lives in an `enums.ts` or a file directly inside an `enums/`
 * folder.
 */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  createRule,
  findDeclarationsOwner,
  isUpperSnakeCase,
  keyName,
  readEnumProperties,
} from '../utils.ts';

export const enumShape = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'An enum (an `as const` object literal of string or number literals) has an UPPER_SNAKE_CASE name and UPPER_SNAKE_CASE keys, and when exported lives in an `enums.ts` or a file directly inside an `enums/` folder.',
    },
    messages: {
      name: 'Name the enum `{{name}}` in UPPER_SNAKE_CASE.',
      key: 'Name the enum key `{{key}}` in UPPER_SNAKE_CASE. Only its value may follow an external format.',
      file: 'Move the exported enum `{{name}}` into an `enums.ts` file, or a file directly inside an `enums/` folder.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    const moduleEnums = new Map<string, TSESTree.Identifier>();
    const exported = new Set<string>();
    return {
      VariableDeclarator: (node): void => {
        const properties = readEnumProperties(node.init);
        if (properties === undefined || node.id.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        if (!isUpperSnakeCase(node.id.name)) {
          context.report({ node: node.id, messageId: 'name', data: { name: node.id.name } });
        }
        for (const property of properties) {
          const key = keyName(property) ?? '';
          if (!isUpperSnakeCase(key)) {
            context.report({ node: property.key, messageId: 'key', data: { key } });
          }
        }
        const declarationParent = node.parent.parent;
        if (declarationParent.type === AST_NODE_TYPES.Program) {
          moduleEnums.set(node.id.name, node.id);
        } else if (
          declarationParent.type === AST_NODE_TYPES.ExportNamedDeclaration &&
          declarationParent.parent.type === AST_NODE_TYPES.Program
        ) {
          moduleEnums.set(node.id.name, node.id);
          exported.add(node.id.name);
        }
      },
      'Program > ExportNamedDeclaration > ExportSpecifier': (
        node: TSESTree.ExportSpecifier,
      ): void => {
        if (node.local.type === AST_NODE_TYPES.Identifier) {
          exported.add(node.local.name);
        }
      },
      'Program:exit': (): void => {
        if (findDeclarationsOwner(context.filename, 'enums') !== undefined) {
          return;
        }
        for (const name of exported) {
          const node = moduleEnums.get(name);
          if (node !== undefined) {
            context.report({ node, messageId: 'file', data: { name } });
          }
        }
      },
    };
  },
});
