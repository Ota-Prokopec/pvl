/** The file globs and restricted-syntax selectors the presets are built from. */

/** The files the preset lints as TypeScript. */
export const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];

/** Selectors for the conventions that core `no-restricted-syntax` can check; each message is the instruction to follow. An entry adding its own spreads these in, as a rule's options in a later config replace them. */
export const RESTRICTED_SYNTAX = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Declare an `as const` object instead of a TypeScript `enum`.',
  },
  {
    selector: 'FunctionDeclaration',
    message:
      'Declare an arrow function (`const name = (): Type => {}`) instead of a `function` declaration.',
  },
  {
    selector:
      'FunctionExpression:not(MethodDefinition > FunctionExpression, Property[method=true] > FunctionExpression, Property[kind=/^(get|set)$/] > FunctionExpression)',
    message: 'Use an arrow function instead of a `function` expression.',
  },
  {
    selector: "CallExpression[callee.name='require']",
    message: 'Use an ESM `import` instead of `require`.',
  },
  {
    selector: "MemberExpression[object.name='module'][property.name='exports']",
    message: 'Use an ESM `export` instead of `module.exports`.',
  },
  {
    selector: "MemberExpression[object.name='exports']",
    message: 'Use an ESM `export` instead of `exports.*`.',
  },
  {
    selector: 'TSExternalModuleReference',
    message: 'Use an ESM `import` instead of `import … = require(…)`.',
  },
];
