/**
 * The absolute path of a scanned file's mirrored module. Branded so it can't
 * be mixed up with the scanned file's own path: the `Module` constructor is
 * the only place one is made.
 */
export type MirroredPath = string & { readonly __brand: 'MirroredPath' };

/** One file the Destination Directory holds. */
export type MirroredFile = {
  /** Its path relative to the Destination Directory, with `/` separators. */
  relativePath: string;
  text: string;
};

/** One change to a module's text: `text` in place of what lies between `start` and `end`, inserted when they are equal. */
export type TextEdit = {
  start: number;
  end: number;
  text: string;
};
