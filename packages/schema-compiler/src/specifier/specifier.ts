// A module specifier, and every way the mirror reads and respells it: what
// kind of specifier it is, the one a relative path is named by, and how one
// written in a scanned module is spelled from its mirrored module's location.
import * as path from 'node:path';
import { SPECIFIER_TARGET_KIND } from './enums.js';
import { stripFileExtension, toPosixPath, type AbsolutePath } from '../path.js';

/** What a module specifier reaches, resolved from where it was written. */
export type SpecifierTarget =
  | {
      kind: typeof SPECIFIER_TARGET_KIND.MIRRORED | typeof SPECIFIER_TARGET_KIND.REPOSITORY;
      /** The mirrored module of a scanned file, or the unscanned original file. */
      path: AbsolutePath;
    }
  | { kind: typeof SPECIFIER_TARGET_KIND.UNRESOLVED };

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
 * new Specifier('../lib/helpers.js').isRelative()           // true
 * Specifier.fromRelativePath('schemas/user.js').value       // './schemas/user.js'
 * new Specifier('@pvl/schema').rewrite({ target: { kind: SPECIFIER_TARGET_KIND.UNRESOLVED }, … }).value // '@pvl/schema'
 * ```
 */
export class Specifier {
  /** The module specifier, as written. */
  public readonly value: string;

  /** A `Specifier` of `value`, as written. */
  public constructor(value: string) {
    this.value = value;
  }

  /**
   * The relative module specifier naming the file at the relative path
   * `relativePath`, in POSIX form and starting with a dot so it isn't read as
   * a package name.
   *
   * ```ts
   * Specifier.fromRelativePath('schemas/user.js').value   // './schemas/user.js'
   * Specifier.fromRelativePath('../lib/helpers.js').value // '../lib/helpers.js'
   * ```
   */
  public static fromRelativePath(relativePath: string): Specifier {
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
  public isRelative(): boolean {
    return this.value.startsWith('./') || this.value.startsWith('../');
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
    return this.isRelative() || path.isAbsolute(this.value);
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
   * new Specifier('../lib/helpers.js').rebase(…).value // '../../src/lib/helpers.js'
   * new Specifier('./tags').rebase(…).value            // '../../src/schemas/tags'
   * ```
   */
  public rebase({ importerPath, outputDirectory }: RebaseSpecifierArgs): Specifier {
    return Specifier.fromRelativePath(
      path.relative(
        outputDirectory.absolutePath,
        path.resolve(path.dirname(importerPath.absolutePath), this.value),
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
   * new Specifier('@/schemas/user.js').toRelative({ targetPath: '/repo/.pvl/schemas/user.ts', … }).value // './user.js'
   * new Specifier('@/lib/helpers').toRelative({ targetPath: '/repo/src/lib/helpers.ts', … }).value      // '../../src/lib/helpers'
   * new Specifier('@/data.json').toRelative({ targetPath: '/repo/src/data.json', … }).value             // '../../src/data.json'
   * ```
   */
  public toRelative({ targetPath, outputDirectory }: ToRelativeSpecifierArgs): Specifier {
    const originalExtension = path.extname(this.value);
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
   * './user.js'         // MIRRORED  → './user.js': the mirror has the same layout
   * '../lib/helpers.js' // REPOSITORY → '../../src/lib/helpers.js': back to the original
   * '@/schemas/user.js' // MIRRORED  → './user.js': the alias reaches a scanned file
   * '@/lib/helpers'     // REPOSITORY → '../../src/lib/helpers': the alias reaches an unscanned file
   * '@pvl/schema'       // UNRESOLVED → '@pvl/schema': a package, kept
   * '@/lib/missing'     // UNRESOLVED → '@/lib/missing': resolves to nothing, kept
   * ```
   */
  public rewrite({ target, importerPath, outputDirectory }: RewriteSpecifierArgs): Specifier {
    // A relative path to a scanned file already reaches its mirrored module:
    // the mirror reproduces the Root Directory's layout, so both ends moved
    // together.
    if (target.kind === SPECIFIER_TARGET_KIND.MIRRORED && this.isRelative()) {
      return this;
    }

    // A path to anything unscanned points back to the original file. It is
    // rewritten from the path as written rather than from the resolved file,
    // so it keeps its spelling, and one that resolves to nothing still points
    // where it did.
    if (target.kind !== SPECIFIER_TARGET_KIND.MIRRORED && this.isPath()) {
      return this.rebase({ importerPath, outputDirectory });
    }

    // A package, or an alias that resolves to nothing, reads the same from
    // anywhere, so it is kept as written.
    if (target.kind === SPECIFIER_TARGET_KIND.UNRESOLVED) {
      return this;
    }

    // What's left names the original location without a relative path: an
    // alias that resolves to a file, or an absolute path to a scanned file.
    // Each becomes a relative path to the target, keeping its extension
    // spelling.
    return this.toRelative({ targetPath: target.path, outputDirectory });
  }
}
