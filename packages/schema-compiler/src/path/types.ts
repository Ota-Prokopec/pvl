// Where a file or directory is: its absolute path, and its path relative to a
// base directory when the mirror places it against one; and a file path split
// from its extension.

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

/** What `splitFileExtension` reads off a file path. */
export type SplitFileExtensionPayload = {
  /** The path without its extension, a declaration file's whole `.d.ts` or `.d.css.ts` included. */
  readonly extensionlessPath: string;
  /** The extension of the file a `.d.<ext>.ts` declares (`.css` for `styles.d.css.ts`), or `undefined` for any other file. */
  readonly declaredExtension: string | undefined;
};
