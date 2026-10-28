// The pure functions `Module` writes its mirrored module with, which read
// nothing of the Module itself: the indentation an inserted line takes, and
// the type aliases the module ends with.
import { INFER_INPUT_TYPE_NAME, INFER_OUTPUT_TYPE_NAME } from './consts.js';

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

/**
 * The `Input` and `Output` type aliases a module ends with, one pair per
 * Schema name, typed from its binding through `typeof` (ADR-0036).
 *
 * ```ts
 * renderTypeAliases(['user'])
 * // ['export type UserInput = PvlInferInput<typeof user>;', 'export type UserOutput = PvlInferOutput<typeof user>;']
 * ```
 */
export const renderTypeAliases = (schemaNames: ReadonlyArray<string>): string[] => {
  return schemaNames.flatMap((name) => {
    const capitalisedName = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return [
      `export type ${capitalisedName}Input = ${INFER_INPUT_TYPE_NAME}<typeof ${name}>;`,
      `export type ${capitalisedName}Output = ${INFER_OUTPUT_TYPE_NAME}<typeof ${name}>;`,
    ];
  });
};
