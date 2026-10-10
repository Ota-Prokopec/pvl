// A module specifier, or a file path one is built from, and every way the
// mirror reads and respells it: how it is shown, what kind of specifier it
// is, and how it is spelled from a mirrored module's location.
import * as path from 'node:path';
import { SPECIFIER_TARGET_KIND } from '../../enums.js';
import { Path } from '../path.js';

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

/** What a module specifier reaches, resolved from where it was written. */
export type SpecifierTarget =
  | {
      kind: typeof SPECIFIER_TARGET_KIND.MIRRORED | typeof SPECIFIER_TARGET_KIND.REPOSITORY;
      /** The mirrored module of a scanned file, or the unscanned original file. */
      path: Path;
    }
  | { kind: typeof SPECIFIER_TARGET_KIND.UNRESOLVED };

/**
 * A module specifier, or a file path one is built from, with what it reaches
 * when that is known. Every method that respells it returns a new
 * `Specifier` without a target, leaving this one as it was: a target holds
 * only for the specifier as written, from where it was written.
 *
 * ```ts
 * new Specifier('../lib/helpers.js').isRelative() // true
 * new Specifier('schemas/user.ts').toBarrel().value // './schemas/user.js'
 * new Specifier('@pvl/schema', { kind: SPECIFIER_TARGET_KIND.UNRESOLVED }).target?.kind // 'UNRESOLVED'
 * ```
 */
export class Specifier {
  /** The module specifier or file path, as written. */
  public readonly value: string;
  /** What this module specifier reaches, or `undefined` when it hasn't been resolved. */
  public readonly target: SpecifierTarget | undefined;

  /** A `Specifier` of `value`, as written, reaching `target` when it has been resolved. */
  public constructor(value: string, target?: SpecifierTarget) {
    this.value = value;
    this.target = target;
  }

  /**
   * This specifier with the platform's separators replaced by `/`, so the
   * mirror and the diagnostics read the same on Windows as elsewhere.
   *
   * ```ts
   * new Specifier('src\\schemas\\user.ts').toPosix().value // 'src/schemas/user.ts' on Windows
   * new Specifier('src/schemas/user.ts').toPosix().value   // unchanged on macOS and Linux
   * ```
   */
  public toPosix(): Specifier {
    return new Specifier(Path.toPosix(this.value));
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
   * Whether this path is a declaration file, which holds only types.
   *
   * ```ts
   * new Specifier('schemas/types.d.ts').isDeclarationFile()  // true
   * new Specifier('schemas/types.d.mts').isDeclarationFile() // true
   * new Specifier('schemas/user.ts').isDeclarationFile()     // false
   * ```
   */
  public isDeclarationFile(): boolean {
    return DECLARATION_FILE_SUFFIXES.some((suffix) => this.value.endsWith(suffix));
  }

  /**
   * This relative path as a relative module specifier, in POSIX form and
   * starting with a dot so it isn't read as a package name.
   *
   * ```ts
   * new Specifier('schemas/user.js').toDotRelative().value   // './schemas/user.js'
   * new Specifier('../lib/helpers.js').toDotRelative().value // '../lib/helpers.js'
   * ```
   */
  public toDotRelative(): Specifier {
    const posixSpecifier = this.toPosix();
    return posixSpecifier.value.startsWith('.')
      ? posixSpecifier
      : new Specifier(`./${posixSpecifier.value}`);
  }

  /**
   * This path without its extension, a declaration file's whole `.d.ts`
   * included.
   *
   * ```ts
   * new Specifier('/repo/src/lib/helpers.ts').stripFileExtension().value // '/repo/src/lib/helpers'
   * new Specifier('/repo/src/lib/types.d.ts').stripFileExtension().value // '/repo/src/lib/types'
   * new Specifier('/repo/src/data.json').stripFileExtension().value      // '/repo/src/data'
   * ```
   */
  public stripFileExtension(): Specifier {
    const declarationFileSuffix = DECLARATION_FILE_SUFFIXES.find((suffix) =>
      this.value.endsWith(suffix),
    );
    const extension = declarationFileSuffix ?? path.extname(this.value);
    return new Specifier(this.value.slice(0, this.value.length - extension.length));
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
  public rebase({
    importerPath,
    outputDirectory,
  }: {
    importerPath: Path;
    outputDirectory: Path;
  }): Specifier {
    return new Specifier(
      path.relative(
        outputDirectory.absolutePath,
        path.resolve(path.dirname(importerPath.absolutePath), this.value),
      ),
    ).toDotRelative();
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
  public toRelative({
    targetPath,
    outputDirectory,
  }: {
    targetPath: Path;
    outputDirectory: Path;
  }): Specifier {
    const originalExtension = path.extname(this.value);
    const spelledExtension = MODULE_SPECIFIER_EXTENSIONS.has(originalExtension)
      ? originalExtension
      : '';

    const extensionlessTargetPath = new Specifier(targetPath.absolutePath).stripFileExtension()
      .value;

    return new Specifier(
      `${path.relative(outputDirectory.absolutePath, extensionlessTargetPath)}${spelledExtension}`,
    ).toDotRelative();
  }

  /**
   * This module specifier, written in the file `importerPath`, spelled so it
   * reaches its `target` from `outputDirectory`, the mirrored module's
   * directory.
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
   *
   * Throws when this specifier has no target, as only a resolved one can be
   * rewritten.
   */
  public rewrite({
    importerPath,
    outputDirectory,
  }: {
    importerPath: Path;
    outputDirectory: Path;
  }): Specifier {
    const { target } = this;
    if (target === undefined) {
      throw new Error(`Module specifier '${this.value}' was rewritten before it was resolved.`);
    }

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

  /**
   * The module specifier the barrel re-exports the mirrored module at this
   * path (relative to the Destination Directory) through, with the `.js`
   * family extension a TypeScript import of it spells, which resolves under
   * both `NodeNext` and `bundler` module resolution without
   * `allowImportingTsExtensions`. A declaration file is named by the module
   * it describes.
   *
   * ```ts
   * new Specifier('schemas/user.ts').toBarrel().value     // './schemas/user.js'
   * new Specifier('schemas/legacy.mts').toBarrel().value  // './schemas/legacy.mjs'
   * new Specifier('schemas/types.d.ts').toBarrel().value  // './schemas/types.js'
   * new Specifier('schemas/types.d.cts').toBarrel().value // './schemas/types.cjs'
   * new Specifier('schemas/plain.js').toBarrel().value    // './schemas/plain.js'
   * ```
   */
  public toBarrel(): Specifier {
    const sourceExtension = path.extname(this.value);
    const barrelExtension =
      BARREL_EXTENSION_BY_SOURCE_EXTENSION.get(sourceExtension) ?? sourceExtension;
    return new Specifier(`${this.stripFileExtension().value}${barrelExtension}`).toDotRelative();
  }
}
