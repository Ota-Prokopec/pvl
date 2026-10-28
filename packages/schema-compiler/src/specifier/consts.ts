// The extensions a module specifier may spell out, which a rewritten one keeps.

/** Extensions a module specifier may spell out, which a rewritten one keeps. */
export const MODULE_SPECIFIER_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.json',
]);
