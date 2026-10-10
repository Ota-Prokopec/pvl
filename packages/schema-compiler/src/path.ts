// A file's or directory's location: its absolute path and, when it is known
// against a base directory, its path relative to that base.
import * as path from 'node:path';

/** Where a file or directory is. */
export class Path {
  /** Its absolute path. */
  public readonly absolutePath: string;
  /** Its path relative to a base directory, when one is known. */
  public readonly relative?: {
    /** The base directory's absolute path. */
    absoluteBase: string;
    /** `absolutePath` relative to `absoluteBase`, with `/` separators. */
    path: string;
  };

  /** A `Path` of `absolutePath`, with `relative` when it is known; `Path.create` makes one. */
  protected constructor(absolutePath: string, relative?: Path['relative']) {
    this.absolutePath = absolutePath;
    if (relative !== undefined) {
      this.relative = relative;
    }
  }

  /**
   * The `Path` of `absolutePath`, with its path relative to `absoluteBase`
   * when one is given.
   *
   * ```ts
   * Path.create('/repo/.pvl')
   * // { absolutePath: '/repo/.pvl' }
   * Path.create('/repo/.pvl', '/repo')
   * // { absolutePath: '/repo/.pvl', relative: { absoluteBase: '/repo', path: '.pvl' } }
   * Path.create('/repo/src/schemas/user.ts', '/repo/src')
   * // { …, relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' } }: `/` separators on Windows too
   * ```
   */
  public static create(absolutePath: string): Path;
  public static create(absolutePath: string, absoluteBase: string): Required<Path>;
  public static create(absolutePath: string, absoluteBase?: string): Path {
    return absoluteBase === undefined
      ? new Path(absolutePath)
      : new Path(absolutePath, {
          absoluteBase,
          path: Path.toPosix(path.relative(absoluteBase, absolutePath)),
        });
  }

  /**
   * `value` with the platform's separators replaced by `/`, so the mirror
   * and the diagnostics read the same on Windows as elsewhere.
   *
   * ```ts
   * Path.toPosix('src\\schemas\\user.ts') // 'src/schemas/user.ts' on Windows
   * Path.toPosix('src/schemas/user.ts')   // unchanged on macOS and Linux
   * ```
   */
  public static toPosix(value: string): string {
    return value.split(path.sep).join(path.posix.sep);
  }
}
