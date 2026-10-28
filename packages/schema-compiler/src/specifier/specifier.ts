// A module specifier, and every way the mirror reads and respells it: what
// kind of specifier it is, the application file it resolves to, the one a
// relative path is named by, and how one written in a scanned module is
// spelled from its mirrored module's location.
import * as path from 'node:path';
import { ts } from 'ts-morph';
import { MODULE_SPECIFIER_EXTENSIONS } from './consts.js';
import { SPECIFIER_TARGET_KIND } from './enums.js';
import type { SpecifierTarget } from './types.js';
import { stripFileExtension, toPosixPath, type AbsolutePath } from '../path.js';

export type RebaseSpecifierArgs = {
  /** The file the module specifier is written in. */
  importerPath: AbsolutePath;
  /** The directory it is spelled from instead. */
  outputDirectory: AbsolutePath;
};

export type ToRelativeSpecifierArgs = {
  /** The file the respelled module specifier names. */
  targetPath: AbsolutePath;
  /** The directory it is spelled from. */
  outputDirectory: AbsolutePath;
};

export type ResolveApplicationFileArgs = {
  /** The file the module specifier is written in. */
  importerPath: AbsolutePath;
  /** The compiler options it resolves under: the application's tsconfig, `paths` included. */
  compilerOptions: ts.CompilerOptions;
};

export type RewriteSpecifierArgs = RebaseSpecifierArgs & {
  /** What the module specifier reaches from `importerPath`, where it is written. */
  target: SpecifierTarget;
};

/**
 * A module specifier, as written. A method that respells it never changes
 * it: it returns the respelled `Specifier`, which is this one when the
 * spelling already reaches the right file.
 *
 * ```ts
 * new Specifier('../lib/helpers.js').isPath() // true
 * new Specifier('@pvl/schema').rewrite({ target: { kind: SPECIFIER_TARGET_KIND.UNRESOLVED }, … }).moduleSpecifierAsString // '@pvl/schema'
 * ```
 */
export class Specifier {
  /** The module specifier as a string: a relative or absolute path, an alias or a package name. */
  public readonly moduleSpecifierAsString: string;

  /** A `Specifier` holding `moduleSpecifierAsString`. */
  public constructor(moduleSpecifierAsString: string) {
    this.moduleSpecifierAsString = moduleSpecifierAsString;
  }

  /**
   * The relative module specifier naming the file at the relative path
   * `relativePath`, in POSIX form and starting with a dot so it isn't read as
   * a package name.
   *
   * ```ts
   * Specifier.fromRelativePath('schemas/user.js').moduleSpecifierAsString   // './schemas/user.js'
   * Specifier.fromRelativePath('../lib/helpers.js').moduleSpecifierAsString // '../lib/helpers.js'
   * ```
   */
  private static fromRelativePath(relativePath: string): Specifier {
    const posixRelativePath = toPosixPath(relativePath);
    return new Specifier(
      posixRelativePath.startsWith('.') ? posixRelativePath : `./${posixRelativePath}`,
    );
  }

  /**
   * Whether this module specifier names a file relative to the importing one.
   *
   * ```ts
   * new Specifier('./user.js').isRelative()      // true
   * new Specifier('../helpers.js').isRelative()  // true
   * new Specifier('/repo/src/a.js').isRelative() // false: absolute
   * new Specifier('@/schemas/user').isRelative() // false: an alias or a package
   * ```
   */
  private isRelative(): boolean {
    return (
      this.moduleSpecifierAsString.startsWith('./') ||
      this.moduleSpecifierAsString.startsWith('../')
    );
  }

  /**
   * Whether this module specifier names a file by its path, rather than a
   * package or an alias, which resolve through `node_modules` or tsconfig
   * `paths`.
   *
   * ```ts
   * new Specifier('./user.js').isPath()      // true
   * new Specifier('/repo/src/a.js').isPath() // true
   * new Specifier('@pvl/schema').isPath()    // false
   * new Specifier('@/schemas/user').isPath() // false
   * ```
   */
  public isPath(): boolean {
    return this.isRelative() || path.isAbsolute(this.moduleSpecifierAsString);
  }

  /**
   * The module TypeScript resolves this module specifier, written in the
   * file `importerPath`, to under `compilerOptions`: tsconfig `paths` first,
   * then relative paths and `node_modules`. `undefined` when it resolves to none.
   *
   * ```ts
   * new Specifier('./user.js').resolveModule(…)    // { resolvedFileName: '/repo/src/schemas/user.ts', isExternalLibraryImport: false, … }
   * new Specifier('@pvl/schema').resolveModule(…)  // { resolvedFileName: '/repo/node_modules/@pvl/schema/dist/index.d.ts', isExternalLibraryImport: true, … }
   * new Specifier('./missing.js').resolveModule(…) // undefined
   * ```
   */
  private resolveModule({
    importerPath,
    compilerOptions,
  }: ResolveApplicationFileArgs): ts.ResolvedModuleFull | undefined {
    return ts.resolveModuleName(
      this.moduleSpecifierAsString,
      importerPath.absolutePath,
      compilerOptions,
      ts.sys,
    ).resolvedModule;
  }

  /**
   * The application file this module specifier, written in the file
   * `importerPath`, resolves to, the way the application's build resolves
   * it, or `undefined` when it resolves to a package or to no file. A bare
   * module specifier that `node_modules` holds is a package even when
   * tsconfig `paths` maps it to a local file, as a workspace package mapped
   * to its source often is, so the mirror keeps it as written.
   *
   * With `importerPath` `/repo/src/schemas/order.ts` and tsconfig `paths`
   * `{ "@/*": ["./src/*"], "@pvl/schema": ["./packages/schema/src/index.ts"] }`:
   *
   * ```ts
   * new Specifier('./user.js').resolveApplicationFile(…)         // { absolutePath: '/repo/src/schemas/user.ts' }
   * new Specifier('../lib/helpers.js').resolveApplicationFile(…) // { absolutePath: '/repo/src/lib/helpers.ts' }
   * new Specifier('@/lib/helpers').resolveApplicationFile(…)     // { absolutePath: '/repo/src/lib/helpers.ts' }: through `paths`
   * new Specifier('@pvl/schema').resolveApplicationFile(…)       // undefined: `node_modules` holds it, which wins over `paths`
   * new Specifier('./missing.js').resolveApplicationFile(…)      // undefined
   * ```
   */
  public resolveApplicationFile({
    importerPath,
    compilerOptions,
  }: ResolveApplicationFileArgs): AbsolutePath | undefined {
    // `paths` set aside, a bare module specifier resolves only through `node_modules`.
    if (
      !this.isPath() &&
      this.resolveModule({
        importerPath,
        compilerOptions: { ...compilerOptions, paths: undefined },
      })?.isExternalLibraryImport === true
    ) {
      return undefined;
    }

    const resolvedModule = this.resolveModule({ importerPath, compilerOptions });
    // Normalised by `path.resolve` to the platform's form, which the mirror's paths are keyed by.
    return resolvedModule === undefined || resolvedModule.isExternalLibraryImport === true
      ? undefined
      : { absolutePath: path.resolve(resolvedModule.resolvedFileName) };
  }

  /**
   * This path module specifier, written in the file `importerPath`, spelled
   * so it reaches the same file from `outputDirectory`. The spelling is kept,
   * so an extension-less or `.js` module specifier stays one.
   *
   * With `importerPath` `/repo/src/schemas/user.ts` and `outputDirectory`
   * `/repo/.pvl/schemas`:
   *
   * ```ts
   * new Specifier('../lib/helpers.js').rebase(…).moduleSpecifierAsString // '../../src/lib/helpers.js'
   * new Specifier('./tags').rebase(…).moduleSpecifierAsString            // '../../src/schemas/tags'
   * ```
   */
  private rebase({ importerPath, outputDirectory }: RebaseSpecifierArgs): Specifier {
    return Specifier.fromRelativePath(
      path.relative(
        outputDirectory.absolutePath,
        path.resolve(path.dirname(importerPath.absolutePath), this.moduleSpecifierAsString),
      ),
    );
  }

  /**
   * A relative module specifier for the file `targetPath`, read from
   * `outputDirectory`, spelling the extension the way this module specifier
   * did: its own extension when it had one, none otherwise.
   *
   * With `outputDirectory` `/repo/.pvl/schemas`:
   *
   * ```ts
   * new Specifier('@/schemas/user.js').toRelative({ targetPath: '/repo/.pvl/schemas/user.ts', … }).moduleSpecifierAsString // './user.js'
   * new Specifier('@/lib/helpers').toRelative({ targetPath: '/repo/src/lib/helpers.ts', … }).moduleSpecifierAsString      // '../../src/lib/helpers'
   * new Specifier('@/data.json').toRelative({ targetPath: '/repo/src/data.json', … }).moduleSpecifierAsString             // '../../src/data.json'
   * ```
   */
  private toRelative({ targetPath, outputDirectory }: ToRelativeSpecifierArgs): Specifier {
    const originalExtension = path.extname(this.moduleSpecifierAsString);
    const spelledExtension = MODULE_SPECIFIER_EXTENSIONS.has(originalExtension)
      ? originalExtension
      : '';

    const extensionlessTargetPath = stripFileExtension(targetPath.absolutePath);

    return Specifier.fromRelativePath(
      `${path.relative(outputDirectory.absolutePath, extensionlessTargetPath)}${spelledExtension}`,
    );
  }

  /**
   * This module specifier, written in the file `importerPath`, where it
   * reaches `target`, spelled so it reaches `target` from `outputDirectory`,
   * the mirrored module's directory.
   *
   * With `importerPath` `/repo/src/schemas/order.ts`, `outputDirectory`
   * `/repo/.pvl/schemas`, user.ts scanned and tsconfig `paths` mapping `@/*`
   * to `./src/*`:
   *
   * ```ts
   * './user.js'                 // MIRRORED  → './user.js': the mirror has the same layout
   * '../lib/helpers.js'         // REPOSITORY → '../../src/lib/helpers.js': back to the original
   * '@/schemas/user.js'         // MIRRORED  → './user.js': the alias reaches a scanned file
   * '@/lib/helpers'             // REPOSITORY → '../../src/lib/helpers': the alias reaches an unscanned file
   * '/repo/src/schemas/user.js' // MIRRORED  → './user.js': an absolute path to a scanned file
   * '/repo/src/lib/helpers.js'  // REPOSITORY → '../../src/lib/helpers.js': an absolute path to an unscanned file
   * '@pvl/schema'               // UNRESOLVED → '@pvl/schema': a package, kept
   * '@/lib/missing'             // UNRESOLVED → '@/lib/missing': resolves to nothing, kept
   * ```
   */
  public rewrite({ target, importerPath, outputDirectory }: RewriteSpecifierArgs): Specifier {
    switch (target.kind) {
      // A relative path already reaches the mirrored module: the mirror
      // reproduces the Root Directory's layout, so both ends moved together.
      // An alias or an absolute path names the original instead, so it
      // becomes a relative path to the mirrored module, keeping its extension
      // spelling.
      case SPECIFIER_TARGET_KIND.MIRRORED:
        return this.isRelative()
          ? this
          : this.toRelative({ targetPath: target.path, outputDirectory });

      // A path points back to the original file. It is rewritten from the
      // path as written rather than from the resolved file, so it keeps its
      // spelling. An alias becomes a relative path to the file it resolves
      // to, keeping its extension spelling.
      case SPECIFIER_TARGET_KIND.REPOSITORY:
        return this.isPath()
          ? this.rebase({ importerPath, outputDirectory })
          : this.toRelative({ targetPath: target.path, outputDirectory });

      // A path that resolves to nothing is rebased all the same, so it still
      // points where it did. A package, or an alias that resolves to nothing,
      // reads the same from anywhere, so it is kept as written.
      case SPECIFIER_TARGET_KIND.UNRESOLVED:
        return this.isPath() ? this.rebase({ importerPath, outputDirectory }) : this;
    }
  }
}
