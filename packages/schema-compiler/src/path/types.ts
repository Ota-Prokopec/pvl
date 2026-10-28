// Where a file or directory is: its absolute path, and its path relative to a
// base directory when the mirror places it against one.

/** Where a file or directory is, by its absolute path. */
export type AbsolutePath<TAbsolutePath extends string = string> = {
  /** Its absolute path. */
  readonly absolutePath: TAbsolutePath;
};

/** Where a file or directory is, by its absolute path and its path relative to a base directory. */
export type AbsolutePathWithRelative<TAbsolutePath extends string = string> =
  AbsolutePath<TAbsolutePath> & {
    /** Its path relative to a base directory. */
    readonly relativePath: {
      /** The base directory's absolute path. */
      readonly absoluteBase: string;
      /** `absolutePath` relative to `absoluteBase`, with `/` separators. */
      readonly pathFromBase: string;
    };
  };
