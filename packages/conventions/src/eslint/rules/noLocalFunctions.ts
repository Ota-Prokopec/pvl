/** Rule: a named function is declared at module scope, never inside another function. */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils.ts';

// Whether `node` is a function, in any of its three syntaxes.
//
//   () => 1                 // true: arrow function
//   function save() {}      // true: function declaration
//   const f = function () {} // true for the function expression
//   class A { m() {} }      // false for the class; `m` is a method
const isFunction = (node: TSESTree.Node): boolean => {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
};

// Whether `node` sits anywhere inside a function, rather than at module
// scope or inside only blocks, classes and objects.
//
//   const top = () => {};             // `top`: false
//   const outer = () => {
//     const inner = () => {};         // `inner`: true
//   };
//   if (debug) { const f = () => {}; } // `f`: false: a block isn't a function
const isInsideFunction = (node: TSESTree.Node): boolean => {
  // The root's `parent` is `null` at runtime, though typed as optional.
  for (
    let current: TSESTree.Node | null | undefined = node.parent;
    current !== undefined && current !== null;
    current = current.parent
  ) {
    if (isFunction(current)) {
      return true;
    }
  }
  return false;
};

// Whether a variable's initializer is a function, which makes the variable
// a named function the rule applies to.
//
//   const save = () => {};          // true
//   const load = function () {};    // true
//   const total = items.length;     // false
//   let pending;                    // false: no initializer
const isFunctionValue = (node: TSESTree.Expression | null): boolean => {
  return (
    node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionExpression
  );
};

export const noLocalFunctions = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Declare a named function at module scope, passing in what it would close over, never inside another function.',
    },
    messages: {
      moveToModuleScope:
        'Move `{{name}}` to module scope and pass what it uses from the enclosing function as arguments; never declare a function inside another function.',
    },
    schema: [],
  },
  defaultOptions: [],
  create: (context) => ({
    FunctionDeclaration: (node): void => {
      if (isInsideFunction(node)) {
        context.report({
          node,
          messageId: 'moveToModuleScope',
          data: { name: node.id?.name ?? 'this function' },
        });
      }
    },
    VariableDeclarator: (node): void => {
      if (isFunctionValue(node.init) && isInsideFunction(node)) {
        context.report({
          node,
          messageId: 'moveToModuleScope',
          data: {
            name: node.id.type === AST_NODE_TYPES.Identifier ? node.id.name : 'this function',
          },
        });
      }
    },
  }),
});
