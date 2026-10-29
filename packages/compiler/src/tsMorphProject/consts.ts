// The tsconfig a ts-morph project is built from, the compiler options laid
// over it, and the one tsconfig error its reading ignores.
import { ts } from 'ts-morph';

/** The application's tsconfig, read for its `paths` aliases when it exists. */
export const TSCONFIG_FILE_NAME = 'tsconfig.json' as const;

/**
 * Bundler resolution over whatever the application's tsconfig says, so
 * `./user.js` finds `user.ts` and an extension-less module specifier finds
 * its file, the way the application's own build does.
 */
export const BUNDLER_COMPILER_OPTIONS = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
  noEmit: true,
} as const satisfies ts.CompilerOptions;

/** TypeScript's error for a tsconfig `include` matching no file, harmless as the mirror adds its own files. */
export const NO_INPUTS_FOUND_ERROR_CODE = 18003 as const;
