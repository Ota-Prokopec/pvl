// Reads a caught value's message, for the directories that report what they
// caught; internal, so outside the barrel.

/** The message of a caught value, which may not be an `Error`. */
export const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
