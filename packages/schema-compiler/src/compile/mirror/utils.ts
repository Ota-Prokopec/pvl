// Path and module specifier helpers the mirror shares: how a path is shown,
// and how a module specifier is spelled from a mirrored module's location.
import { dirname, extname, isAbsolute, posix, relative, resolve, sep } from 'node:path';

/** Extensions a module specifier may spell out, which a rewritten one keeps. */
const MODULE_SPECIFIER_EXTENSIONS: ReadonlySet<string> = new Set([
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

/** Declaration file suffixes, stripped whole so `types.d.ts` isn't left as `types.d`. */
const DECLARATION_FILE_SUFFIXES = ['.d.ts', '.d.mts', '.d.cts'] as const;

/** The extension a barrel spells for each TypeScript extension, so it resolves under Node and bundlers alike. */
const BARREL_EXTENSION_BY_SOURCE_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.ts', '.js'],
  ['.tsx', '.js'],
  ['.mts', '.mjs'],
  ['.cts', '.cjs'],
]);

/**
 * `path` with the platform's separators replaced by `/`, so the mirror and
 * the diagnostics read the same on Windows as elsewhere.
 *
 * ```ts
 * toPosixPath('src\\schemas\\user.ts') // 'src/schemas/user.ts' on Windows
 * toPosixPath('src/schemas/user.ts')   // unchanged on macOS and Linux
 * ```
 */
export const toPosixPath = (path: string): string => {
  return path.split(sep).join(posix.sep);
};

/**
 * Whether `moduleSpecifier` names a file relative to the importing one.
 *
 * ```ts
 * isRelativeModuleSpecifier('./user.js')      // true
 * isRelativeModuleSpecifier('../helpers.js')  // true
 * isRelativeModuleSpecifier('/repo/src/a.js') // false: absolute
 * isRelativeModuleSpecifier('@/schemas/user') // false: an alias or a package
 * ```
 */
export const isRelativeModuleSpecifier = (moduleSpecifier: string): boolean => {
  return moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../');
};

/**
 * Whether `moduleSpecifier` names a file by its path, rather than a package
 * or an alias, which resolve through `node_modules` or tsconfig `paths`.
 *
 * ```ts
 * isPathModuleSpecifier('./user.js')        // true
 * isPathModuleSpecifier('/repo/src/a.js')   // true
 * isPathModuleSpecifier('@pvl/schema')      // false
 * isPathModuleSpecifier('@/schemas/user')   // false
 * ```
 */
export const isPathModuleSpecifier = (moduleSpecifier: string): boolean => {
  return isRelativeModuleSpecifier(moduleSpecifier) || isAbsolute(moduleSpecifier);
};

// `relativePath` as a relative module specifier, which must start with a
// dot so it isn't read as a package name.
//
//   toDotRelativeModuleSpecifier('schemas/user.js')   // './schemas/user.js'
//   toDotRelativeModuleSpecifier('../lib/helpers.js') // '../lib/helpers.js'
const toDotRelativeModuleSpecifier = (relativePath: string): string => {
  const posixPath = toPosixPath(relativePath);
  return posixPath.startsWith('.') ? posixPath : `./${posixPath}`;
};

/**
 * `moduleSpecifier`, a path written in the file `importerPath`, spelled so
 * it reaches the same file from `outputDirectory`. The spelling is kept, so
 * an extension-less or `.js` module specifier stays one.
 *
 * With `importerPath` `/repo/src/schemas/user.ts` and `outputDirectory`
 * `/repo/.pvl/schemas`:
 *
 * ```ts
 * rewritePathModuleSpecifier('../lib/helpers.js', …) // '../../src/lib/helpers.js'
 * rewritePathModuleSpecifier('./tags', …)            // '../../src/schemas/tags'
 * ```
 */
export const rewritePathModuleSpecifier = (
  moduleSpecifier: string,
  importerPath: string,
  outputDirectory: string,
): string => {
  return toDotRelativeModuleSpecifier(
    relative(outputDirectory, resolve(dirname(importerPath), moduleSpecifier)),
  );
};

// `filePath` without its extension, a declaration file's whole `.d.ts`
// included.
//
//   stripFileExtension('/repo/src/lib/helpers.ts')  // '/repo/src/lib/helpers'
//   stripFileExtension('/repo/src/lib/types.d.ts')  // '/repo/src/lib/types'
//   stripFileExtension('/repo/src/data.json')       // '/repo/src/data'
const stripFileExtension = (filePath: string): string => {
  const declarationFileSuffix = DECLARATION_FILE_SUFFIXES.find((suffix) =>
    filePath.endsWith(suffix),
  );
  const extension = declarationFileSuffix ?? extname(filePath);
  return filePath.slice(0, filePath.length - extension.length);
};

/**
 * A relative module specifier for the file `targetPath`, from the directory
 * `outputDirectory`, spelling the extension the way `originalModuleSpecifier`
 * did: its own extension when it had one, none otherwise.
 *
 * With `outputDirectory` `/repo/.pvl/schemas`:
 *
 * ```ts
 * toRelativeModuleSpecifier(…, '/repo/.pvl/schemas/user.ts', '@/schemas/user.js') // './user.js'
 * toRelativeModuleSpecifier(…, '/repo/src/lib/helpers.ts', '@/lib/helpers')      // '../../src/lib/helpers'
 * toRelativeModuleSpecifier(…, '/repo/src/data.json', '@/data.json')             // '../../src/data.json'
 * ```
 */
export const toRelativeModuleSpecifier = (
  outputDirectory: string,
  targetPath: string,
  originalModuleSpecifier: string,
): string => {
  const originalExtension = extname(originalModuleSpecifier);
  const spelledExtension = MODULE_SPECIFIER_EXTENSIONS.has(originalExtension)
    ? originalExtension
    : '';
  return toDotRelativeModuleSpecifier(
    `${relative(outputDirectory, stripFileExtension(targetPath))}${spelledExtension}`,
  );
};

/**
 * The module specifier the barrel re-exports the mirrored module at
 * `relativePath` (relative to the Destination Directory) through, with the
 * `.js` family extension a TypeScript import of it spells.
 *
 * ```ts
 * toBarrelModuleSpecifier('schemas/user.ts')  // './schemas/user.js'
 * toBarrelModuleSpecifier('schemas/legacy.mts') // './schemas/legacy.mjs'
 * toBarrelModuleSpecifier('schemas/plain.js') // './schemas/plain.js'
 * ```
 */
export const toBarrelModuleSpecifier = (relativePath: string): string => {
  const extension = extname(relativePath);
  const barrelExtension = BARREL_EXTENSION_BY_SOURCE_EXTENSION.get(extension) ?? extension;
  return toDotRelativeModuleSpecifier(
    `${relativePath.slice(0, relativePath.length - extension.length)}${barrelExtension}`,
  );
};
