/** Rule: a file that exports a class is named after it, the class name with a lowercase first letter. */
import * as path from 'node:path';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

// The file name a class named `className` lives in, without its extension.
//
//   toClassFileName('DestinationWriter') // 'destinationWriter'
//   toClassFileName('TsMorphProject')    // 'tsMorphProject'
const toClassFileName = (className: string): string => {
  return `${className.charAt(0).toLowerCase()}${className.slice(1)}`;
};

// The class `declaration` exports when the file isn't named after it, or
// `undefined` when it is, or when `declaration` declares no named class.
//
//   // destinationWriter.ts
//   export class DestinationWriter {} // undefined
//   export class Destination {}       // the `Destination` identifier
//   export const run = () => {};      // undefined
const findMisnamedClass = (
  fileName: string,
  declaration: TSESTree.Node | null | undefined,
): TSESTree.Identifier | undefined => {
  return declaration?.type === AST_NODE_TYPES.ClassDeclaration &&
    declaration.id !== null &&
    fileName !== toClassFileName(declaration.id.name)
    ? declaration.id
    : undefined;
};

export const classFileName = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Name a file that exports a class after that class, with a lowercase first letter: `DestinationWriter` lives in `destinationWriter.ts`.',
    },
    messages: {
      fileName:
        'Rename this file to `{{expected}}.ts`, after the class `{{name}}` it exports, or rename the class after the file.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    const fileName = path.parse(context.filename).name;
    return {
      'ExportNamedDeclaration, ExportDefaultDeclaration': (
        node: TSESTree.ExportNamedDeclaration | TSESTree.ExportDefaultDeclaration,
      ): void => {
        const classId = findMisnamedClass(fileName, node.declaration);
        if (classId !== undefined) {
          context.report({
            node: classId,
            messageId: 'fileName',
            data: { name: classId.name, expected: toClassFileName(classId.name) },
          });
        }
      },
    };
  },
});
