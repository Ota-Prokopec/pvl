// The pure functions `Module` writes its mirrored module with, which read
// nothing of the Module itself: the indentation an inserted line takes.

/**
 * The whitespace the line holding `position` in `moduleText` starts with.
 *
 * ```ts
 * findLineIndentation('if (x) {\n    return pvl.compile(a);\n}', 20) // '    '
 * findLineIndentation('export const u = pvl.compile(a);', 17)        // ''
 * ```
 */
export const findLineIndentation = (moduleText: string, position: number): string => {
  const lineStart = moduleText.lastIndexOf('\n', position - 1) + 1;
  const lineText = moduleText.slice(lineStart, position);
  return lineText.slice(0, lineText.length - lineText.trimStart().length);
};
