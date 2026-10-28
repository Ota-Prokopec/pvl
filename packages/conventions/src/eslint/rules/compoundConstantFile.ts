/**
 * Rule: a compound constant (a module-level UPPER_SNAKE_CASE `const`
 * initialised with an array, an object other than an enum, a `Set` or a
 * `Map`), exported or not, lives in a `consts.ts` or a file directly inside a
 * `consts/` folder, unless its name ends in one of `allowedNameSuffixes`. An
 * `enums.ts` holds enums built from others (`{ ...PRE, ...POST }`), so it is
 * left alone.
 */
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  createRule,
  findDeclarationsOwner,
  isUpperSnakeCase,
  readEnumProperties,
} from '../utils.ts';

// `value` without the `as const` and `satisfies` around it.
const unwrapValue = (value: TSESTree.Expression): TSESTree.Expression => {
  return value.type === AST_NODE_TYPES.TSAsExpression ||
    value.type === AST_NODE_TYPES.TSSatisfiesExpression
    ? unwrapValue(value.expression)
    : value;
};

// Whether `init` makes its constant compound. An enum is `enum-shape`'s.
//
//   ['.d.ts', '.d.mts'] as const     // true
//   new Set(['&&', '||'])            // true
//   { [KIND.A]: A } satisfies Table  // true
//   { OWNER: 'OWNER' } as const      // false: an enum
//   Object.values(VARIANT)           // false: a call
const isCompound = (init: TSESTree.Expression): boolean => {
  const value = unwrapValue(init);
  switch (value.type) {
    case AST_NODE_TYPES.ArrayExpression:
      return true;
    case AST_NODE_TYPES.ObjectExpression:
      return readEnumProperties(init) === undefined;
    case AST_NODE_TYPES.NewExpression:
      return (
        value.callee.type === AST_NODE_TYPES.Identifier &&
        (value.callee.name === 'Set' || value.callee.name === 'Map')
      );
    default:
      return false;
  }
};

export const compoundConstantFile = createRule<[{ allowedNameSuffixes: string[] }], 'file'>({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'A module-level UPPER_SNAKE_CASE `const` initialised with an array, an object other than an enum, a `Set` or a `Map`, exported or not, lives in a `consts.ts` or a file directly inside a `consts/` folder, unless it sits in an `enums.ts` or its name ends in one of `allowedNameSuffixes`.',
    },
    messages: {
      file: 'Move the constant `{{name}}` into a `consts.ts` file, or a file directly inside a `consts/` folder, and import it from there.',
    },
    schema: [
      {
        type: 'object',
        properties: { allowedNameSuffixes: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ allowedNameSuffixes: [] }],
  create: (context, [{ allowedNameSuffixes }]) => {
    if (
      findDeclarationsOwner(context.filename, 'consts') !== undefined ||
      findDeclarationsOwner(context.filename, 'enums') !== undefined
    ) {
      return {};
    }
    return {
      'Program > VariableDeclaration, Program > ExportNamedDeclaration > VariableDeclaration': (
        node: TSESTree.VariableDeclaration,
      ): void => {
        if (node.kind !== 'const') {
          return;
        }
        for (const { id, init } of node.declarations) {
          if (
            id.type === AST_NODE_TYPES.Identifier &&
            init !== null &&
            isUpperSnakeCase(id.name) &&
            isCompound(init) &&
            !allowedNameSuffixes.some((suffix) => id.name.endsWith(suffix))
          ) {
            context.report({ node: id, messageId: 'file', data: { name: id.name } });
          }
        }
      },
    };
  },
});
