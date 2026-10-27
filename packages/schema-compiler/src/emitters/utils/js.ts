// How emitted text is templated and indented. A fragment of a fixed shape,
// whose slots each hold a one-line expression, is written in a `js`
// template, as `js` would misindent a multi-line one; a block wrapping any
// statements is written with `composeBlock`, which indents them; and a
// multi-line expression written on an indented line is lined up with it by
// `indentContinuationLines`.
import dedent from 'dedent';

/**
 * Tags a template holding emitted JavaScript, so it reads as code: the text
 * comes back as written, backslashes included, with the indentation its
 * lines share stripped and its surrounding whitespace trimmed. A block can
 * therefore be written across lines, indented as it sits in the source.
 *
 * ```ts
 * js`typeof ${'field0'} !== "string"` // 'typeof field0 !== "string"'
 * js`if (ok) {
 *      run();
 *    }`                               // 'if (ok) {\n  run();\n}'
 * ```
 */
export const js = dedent.withOptions({ escapeSpecialCharacters: false });

/**
 * `text` with every line indented by `indentation`. An empty line stays
 * empty, so no line ends in whitespace.
 *
 * ```ts
 * indentLines('run();\n\nstop();', '  ') // '  run();\n\n  stop();'
 * ```
 */
const indentLines = (text: string, indentation: string): string => {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : `${indentation}${line}`))
    .join('\n');
};

/** What {@link composeBlock} writes a block from: what precedes its braces, and the statements they wrap. */
type ComposeBlockArgs = {
  /** What precedes the braces: `if (ok)`, `for (const key of Object.keys(input1))`, a base check and its `else`. */
  head: string;
  /** The statements, on one line or several. */
  body: string;
};

/**
 * A block: `head`, then `body` inside braces, every line of it indented one
 * level, so a multi-line `body` (another block, a list of checks) keeps its
 * own indentation beneath it. An empty line stays empty.
 *
 * ```ts
 * composeBlock({ head: 'if (ok)', body: 'run();\n\nstop();' }) // 'if (ok) {\n  run();\n\n  stop();\n}'
 * ```
 */
export const composeBlock = ({ head, body }: ComposeBlockArgs): string => {
  return `${head} {\n${indentLines(body, '  ')}\n}`;
};

/**
 * `text` with every line after its first indented by `indentation`, so a
 * multi-line expression written where a line is indented lines up with it.
 * An empty line stays empty.
 *
 * ```ts
 * indentContinuationLines('class A {\n  m() {}\n}', '    ') // 'class A {\n      m() {}\n    }'
 * indentContinuationLines('a', '    ')                      // 'a'
 * ```
 */
export const indentContinuationLines = (text: string, indentation: string): string => {
  const firstLineBreakIndex = text.indexOf('\n');
  return firstLineBreakIndex === -1
    ? text
    : `${text.slice(0, firstLineBreakIndex + 1)}${indentLines(text.slice(firstLineBreakIndex + 1), indentation)}`;
};
