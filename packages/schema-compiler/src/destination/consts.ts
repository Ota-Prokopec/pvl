// The Destination Directory's layout: the marker file that lets a later run
// replace it, the sibling directories a run swaps it through, and the default
// destination's `.gitignore`.

/** The file that marks a Destination Directory as written by the compiler, so a later run may replace it. */
export const GENERATED_MARKER_FILE_NAME = '.pvl-generated' as const;

/** The marker file's contents. */
export const GENERATED_MARKER_TEXT =
  'Written by @pvl/schema-compiler. `pvl compile` replaces this whole directory.\n' as const;

/** Appended to the destination's name for the sibling directory a run writes into before it moves into place. */
export const TEMPORARY_DESTINATION_SUFFIX = '.pvl-tmp' as const;

/** Appended to the destination's name for the sibling directory the previous output waits in until the new one is in place. */
export const BACKUP_DESTINATION_SUFFIX = '.pvl-old' as const;

/** The name of the `.gitignore` the default destination gets. */
export const GITIGNORE_FILE_NAME = '.gitignore' as const;

/** The default destination's `.gitignore`, which keeps the whole directory out of version control. */
export const DEFAULT_DESTINATION_GITIGNORE_TEXT = '*\n' as const;
