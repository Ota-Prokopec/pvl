/**
 * Rule: a function's `<FunctionName>Args` type is declared directly above the
 * function, or above its header comments when it has them.
 */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

type Named = {
  name: string;
  node: TSESTree.Identifier;
  index: number;
};

const unwrapExport = (statement: TSESTree.Node): TSESTree.Node => {
  return statement.type === AST_NODE_TYPES.ExportNamedDeclaration && statement.declaration !== null
    ? statement.declaration
    : statement;
};

const argsTypeName = (statement: TSESTree.Node): TSESTree.Identifier | undefined => {
  const node = unwrapExport(statement);
  const isType =
    node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
    node.type === AST_NODE_TYPES.TSInterfaceDeclaration;
  return isType && node.id.name.endsWith('Args') ? node.id : undefined;
};

const functionName = (statement: TSESTree.Node): TSESTree.Identifier | undefined => {
  const node = unwrapExport(statement);
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return node.id ?? undefined;
  }
  if (node.type !== AST_NODE_TYPES.VariableDeclaration || node.declarations.length !== 1) {
    return undefined;
  }
  const [declarator] = node.declarations;
  const isFunction =
    declarator?.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    declarator?.init?.type === AST_NODE_TYPES.FunctionExpression;
  return isFunction && declarator.id.type === AST_NODE_TYPES.Identifier ? declarator.id : undefined;
};

const toArgsTypeName = (name: string): string => {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}Args`;
};

export const argsTypeAboveFunction = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "A function's `<FunctionName>Args` type is declared directly above the function, or above its header comments when it has them.",
    },
    messages: {
      placement:
        'Move `{{type}}` directly above `{{name}}` (above its header comments, if it has any), with nothing else in between.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => {
    const check = (statements: TSESTree.Node[]): void => {
      const types = new Map<string, Named>();
      const functions: Named[] = [];
      statements.forEach((statement, index): void => {
        const type = argsTypeName(statement);
        if (type !== undefined) {
          types.set(type.name, { name: type.name, node: type, index });
        }
        const fn = functionName(statement);
        if (fn !== undefined) {
          functions.push({ name: fn.name, node: fn, index });
        }
      });
      for (const fn of functions) {
        const type = types.get(toArgsTypeName(fn.name));
        if (type !== undefined && type.index !== fn.index - 1) {
          context.report({
            node: type.node,
            messageId: 'placement',
            data: { type: type.name, name: fn.name },
          });
        }
      }
    };
    return {
      Program: (node): void => {
        check(node.body);
      },
      BlockStatement: (node): void => {
        check(node.body);
      },
      TSModuleBlock: (node): void => {
        check(node.body);
      },
    };
  },
});
