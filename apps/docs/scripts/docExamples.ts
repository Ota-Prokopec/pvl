// Turns the documentation's code examples into compilable TypeScript.
//
// The examples this reads are the published documentation: TSDoc `@example`
// blocks in `@pvl/schema`'s source, and fenced `ts` blocks in the guide pages.
// Nothing here runs a snippet — each one is rendered into a file that
// `check-types` compiles, so a renamed or re-signatured API breaks the build
// instead of shipping an example that lies.
//
// This module is pure: parsing and rendering only, no filesystem access. The
// `extractDocExamples.ts` shell beside it does the reading and writing.

import type { ValueOfEnum } from '@repo/types';

/**
 * How a documentation snippet opts out of, or into, the typecheck. A marker is
 * written after the language in the fence info string:
 *
 * ```
 * ```ts docs-check-skip
 * ```
 *
 * VitePress reads a fenced block's language as everything up to the first
 * space, so a marker never reaches the rendered page.
 *
 * - `SKIP` leaves the snippet out of the fixtures entirely. It is for code that
 *   is illustrative rather than real — pseudo-code, or a deliberate error.
 * - `SHARED` puts the snippet's declarations at the top level of every fixture
 *   generated from the rest of that document, so a later snippet can build on
 *   it the way a reader working down the page would.
 */
// Values are fence tokens, so they are kebab-case rather than UPPER_SNAKE_CASE
// — the externally-dictated-value carve-out in docs/standards/typescript.md.
export const DOC_EXAMPLE_MARKER = {
  SKIP: 'docs-check-skip',
  SHARED: 'docs-check-shared',
} as const;

export type DocExampleMarker = ValueOfEnum<typeof DOC_EXAMPLE_MARKER>;

/** One code snippet lifted out of a documentation source, with where it came from. */
export type DocExample = {
  /** Repo-relative path of the file the snippet was written in. */
  readonly sourcePath: string;
  /** 1-based line of the snippet's first line of code, not of its fence. */
  readonly line: number;
  readonly code: string;
  readonly shared: boolean;
};

export type ParseDocExamplesArgs = {
  readonly sourcePath: string;
  readonly text: string;
};

/** One generated file, ready to be written under the fixture directory. */
export type DocExampleFixture = {
  /** Path relative to the fixture directory. */
  readonly path: string;
  readonly contents: string;
};

const EXAMPLE_LANGUAGES: ReadonlySet<string> = new Set(['ts', 'typescript']);
const MARKER_NAMESPACE = 'docs-check-' as const;
const KNOWN_MARKERS: ReadonlySet<string> = new Set(Object.values(DOC_EXAMPLE_MARKER));

const FENCE_OPEN_RE = /^\s*```(.*)$/;
const FENCE_CLOSE_RE = /^\s*```\s*$/;
const TSDOC_OPEN_RE = /^\s*\/\*\*/;
const TSDOC_PREFIX_RE = /^\s*\*[ \t]?/;
const TSDOC_FENCE_OPEN_RE = /^```(.*)$/;
const TSDOC_FENCE_CLOSE_RE = /^```\s*$/;
const TSDOC_TAG_RE = /^@\w+/;
const EXAMPLE_TAG_RE = /^@example\b/;

const lineAt = (lines: ReadonlyArray<string>, index: number): string => lines[index] ?? '';

/** Where in a documentation source something is, for an error a reader can act on. */
type DocLocation = {
  readonly sourcePath: string;
  readonly line: number;
};

const at = (location: DocLocation): string => `${location.sourcePath}:${location.line}`;

// VitePress lets a fence carry its highlighting options on the language token
// itself: `ts:line-numbers`, `ts:line-numbers=2`, `ts{1,3}`, `ts-vue`. Its own
// `extractLang` strips all of that to decide the language, and so must this — a
// `ts` block written in any of those forms is still a snippet to check. Getting
// this wrong would not fail loudly; it would silently stop checking the block,
// which is the one thing the default must never do.
const LANGUAGE_NORMALIZERS: ReadonlyArray<RegExp> = [
  /=(\d*)/,
  /:(no-)?line-numbers(\{| |$|=\d*).*/,
  /(-vue|\{| ).*$/,
];

const extractFenceLanguage = (info: string): string =>
  LANGUAGE_NORMALIZERS.reduce((language, pattern) => language.replace(pattern, ''), info.trim());

type ParseFenceInfoPayload = {
  readonly language: string;
  readonly skip: boolean;
  readonly shared: boolean;
};

type ParseFenceInfoArgs = {
  readonly info: string;
  readonly location: DocLocation;
};

const parseFenceInfo = (args: ParseFenceInfoArgs): ParseFenceInfoPayload => {
  const [languageToken = '', ...tokens] = args.info.trim().split(/\s+/);
  const markers = tokens.filter((token) => token.startsWith(MARKER_NAMESPACE));

  const unknown = markers.find((token) => !KNOWN_MARKERS.has(token));
  if (unknown !== undefined) {
    throw new Error(
      `${at(args.location)}: unknown documentation-example marker \`${unknown}\`. ` +
        `Known markers: ${[...KNOWN_MARKERS].join(', ')}.`,
    );
  }

  const skip = markers.includes(DOC_EXAMPLE_MARKER.SKIP);
  const shared = markers.includes(DOC_EXAMPLE_MARKER.SHARED);
  if (skip && shared) {
    throw new Error(
      `${at(args.location)}: \`${DOC_EXAMPLE_MARKER.SKIP}\` and ` +
        `\`${DOC_EXAMPLE_MARKER.SHARED}\` contradict each other — a snippet that is not ` +
        `checked cannot provide shared context to the snippets after it.`,
    );
  }

  return { language: extractFenceLanguage(languageToken), skip, shared };
};

/**
 * Lifts every fenced TypeScript block out of a Markdown document, in document
 * order. Fences nested inside a VitePress container (`::: warning`) are found
 * too; fences in any other language are left alone.
 */
export const parseMarkdownExamples = (args: ParseDocExamplesArgs): ReadonlyArray<DocExample> => {
  const lines = args.text.split('\n');
  const examples: Array<DocExample> = [];
  let index = 0;

  while (index < lines.length) {
    const opening = FENCE_OPEN_RE.exec(lineAt(lines, index));
    if (opening === null) {
      index += 1;
      continue;
    }

    const fence: DocLocation = { sourcePath: args.sourcePath, line: index + 1 };
    const info = parseFenceInfo({ info: opening[1] ?? '', location: fence });

    let end = index + 1;
    while (end < lines.length && !FENCE_CLOSE_RE.test(lineAt(lines, end))) end += 1;
    if (end >= lines.length) {
      throw new Error(`${at(fence)}: unterminated code fence.`);
    }

    if (EXAMPLE_LANGUAGES.has(info.language) && !info.skip) {
      examples.push({
        sourcePath: args.sourcePath,
        line: index + 2,
        code: lines.slice(index + 1, end).join('\n'),
        shared: info.shared,
      });
    }

    index = end + 1;
  }

  return examples;
};

/** One line of a TSDoc comment, with its `*` prefix removed. */
type TsdocLine = {
  readonly line: number;
  readonly content: string;
};

// A `/** ... */` opened and closed on one line (`/** @internal */`) carries no
// example, so only multi-line blocks are collected.
const collectTsdocBlocks = (
  lines: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<TsdocLine>> => {
  const blocks: Array<Array<TsdocLine>> = [];
  let current: Array<TsdocLine> | undefined;

  lines.forEach((raw, offset) => {
    if (current === undefined) {
      if (TSDOC_OPEN_RE.test(raw) && !raw.includes('*/')) current = [];
      return;
    }
    if (raw.includes('*/')) {
      blocks.push(current);
      current = undefined;
      return;
    }
    current.push({ line: offset + 1, content: raw.replace(TSDOC_PREFIX_RE, '') });
  });

  return blocks;
};

type ParseTsdocBlockArgs = {
  readonly block: ReadonlyArray<TsdocLine>;
  readonly sourcePath: string;
};

const parseTsdocBlockExamples = (args: ParseTsdocBlockArgs): ReadonlyArray<DocExample> => {
  const { block, sourcePath } = args;
  const examples: Array<DocExample> = [];
  let index = 0;

  while (index < block.length) {
    if (!EXAMPLE_TAG_RE.test(block[index]?.content ?? '')) {
      index += 1;
      continue;
    }

    // Skip the blank TSDoc lines an author may leave between `@example` and its
    // fence. Anything else — prose, or the next tag — means this `@example` has
    // no fenced snippet to check.
    let cursor = index + 1;
    while (cursor < block.length && (block[cursor]?.content ?? '').trim() === '') cursor += 1;

    const fence = block[cursor];
    const opening =
      fence === undefined || TSDOC_TAG_RE.test(fence.content)
        ? null
        : TSDOC_FENCE_OPEN_RE.exec(fence.content);
    if (fence === undefined || opening === null) {
      index += 1;
      continue;
    }

    const fenceLocation: DocLocation = { sourcePath, line: fence.line };
    const info = parseFenceInfo({ info: opening[1] ?? '', location: fenceLocation });

    let end = cursor + 1;
    while (end < block.length && !TSDOC_FENCE_CLOSE_RE.test(block[end]?.content ?? '')) end += 1;
    if (end >= block.length) {
      throw new Error(`${at(fenceLocation)}: unterminated code fence in an \`@example\` block.`);
    }

    if (EXAMPLE_LANGUAGES.has(info.language) && !info.skip) {
      const body = block.slice(cursor + 1, end);
      examples.push({
        sourcePath,
        line: body[0]?.line ?? fence.line,
        code: body.map((entry) => entry.content).join('\n'),
        shared: info.shared,
      });
    }

    index = end + 1;
  }

  return examples;
};

/**
 * Lifts every fenced TypeScript block that follows an `@example` tag out of a
 * TypeScript file's TSDoc comments. A fence elsewhere in a TSDoc block is not
 * an example and is left alone.
 */
export const parseTsdocExamples = (args: ParseDocExamplesArgs): ReadonlyArray<DocExample> =>
  collectTsdocBlocks(args.text.split('\n')).flatMap((block) =>
    parseTsdocBlockExamples({ block, sourcePath: args.sourcePath }),
  );

/** One name brought in by an example's import statement. */
type ImportBinding = {
  readonly module: string;
  /** The name the snippet's body refers to — the alias, where there is one. */
  readonly localName: string;
  /** The clause entry as it should be written back out, without a `type` prefix. */
  readonly specifier: string;
  readonly typeOnly: boolean;
};

const IMPORT_LINE_RE = /^import\b/;
const TYPE_IMPORT_RE = /^import\s+type\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*;$/;
const NAMED_IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*;$/;
const ALIAS_RE = /\bas\s+([A-Za-z_$][\w$]*)$/;

type ParseImportStatementArgs = {
  readonly statement: string;
  readonly location: DocLocation;
};

const parseImportStatement = (args: ParseImportStatementArgs): ReadonlyArray<ImportBinding> => {
  const typeMatch = TYPE_IMPORT_RE.exec(args.statement);
  const namedMatch = typeMatch === null ? NAMED_IMPORT_RE.exec(args.statement) : null;
  const match = typeMatch ?? namedMatch;

  if (match === null) {
    throw new Error(
      `${at(args.location)}: unsupported import form in a documentation example — ` +
        `\`${args.statement}\`. Examples import named bindings only, e.g. ` +
        `\`import { pvl, type Result } from '@pvl/schema';\`.`,
    );
  }

  const wholeClauseIsTypeOnly = typeMatch !== null;
  const module = match[2] ?? '';

  return (match[1] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const typeOnly = wholeClauseIsTypeOnly || /^type\s/.test(entry);
      const specifier = entry.replace(/^type\s+/, '');
      return {
        module,
        localName: ALIAS_RE.exec(specifier)?.[1] ?? specifier,
        specifier,
        typeOnly,
      };
    });
};

type SplitCodeImportsPayload = {
  readonly bindings: ReadonlyArray<ImportBinding>;
  readonly body: string;
};

type SplitCodeImportsArgs = {
  readonly code: string;
  readonly location: DocLocation;
};

// Imports have to leave the snippet body: a body may end up inside a block
// scope, where an import declaration is not legal.
const splitCodeImports = (args: SplitCodeImportsArgs): SplitCodeImportsPayload => {
  const bindings: Array<ImportBinding> = [];
  const bodyLines: Array<string> = [];

  args.code.split('\n').forEach((raw) => {
    const trimmed = raw.trim();
    if (!IMPORT_LINE_RE.test(trimmed)) {
      bodyLines.push(raw);
      return;
    }
    if (!trimmed.endsWith(';')) {
      throw new Error(
        `${at(args.location)}: an import in a documentation example must be a ` +
          `single line ending in \`;\` — got \`${trimmed}\`.`,
      );
    }
    bindings.push(...parseImportStatement({ statement: trimmed, location: args.location }));
  });

  return { bindings, body: bodyLines.join('\n').trim() };
};

// A value import subsumes a type-only one: it is legal everywhere the type-only
// form was, so keeping the value import is always the safe merge.
const mergeImportBindings = (
  bindings: ReadonlyArray<ImportBinding>,
): ReadonlyArray<ImportBinding> => {
  const merged = new Map<string, ImportBinding>();

  bindings.forEach((binding) => {
    const key = `${binding.module} ${binding.localName}`;
    const existing = merged.get(key);
    if (existing === undefined || (existing.typeOnly && !binding.typeOnly)) {
      merged.set(key, binding);
    }
  });

  return [...merged.values()];
};

const renderImportBindings = (bindings: ReadonlyArray<ImportBinding>): ReadonlyArray<string> => {
  const byModule = new Map<string, Array<ImportBinding>>();

  bindings.forEach((binding) => {
    const existing = byModule.get(binding.module);
    if (existing === undefined) byModule.set(binding.module, [binding]);
    else existing.push(binding);
  });

  return [...byModule.entries()].map(([module, moduleBindings]) => {
    const clause = moduleBindings
      .map((binding) => (binding.typeOnly ? `type ${binding.specifier}` : binding.specifier))
      .join(', ');
    return `import { ${clause} } from '${module}';`;
  });
};

/** A snippet's code plus the source line it starts at, ready to emit. */
type FixtureRegion = {
  readonly line: number;
  readonly code: string;
};

export type RenderDocExampleFixturesArgs = {
  /** One document's examples, in the order they appear in it. */
  readonly examples: ReadonlyArray<DocExample>;
  /** Fixture path prefix for this document, e.g. `guide/schemas`. */
  readonly fixtureStem: string;
};

/**
 * Renders one document's examples into one fixture file each.
 *
 * A fixture is read top to bottom the way the document is: every import the
 * document has shown up to this point, then each `SHARED` snippet's code at the
 * top level, then this snippet's own code. The snippet's own code goes inside a
 * block scope when there is shared code above it, so that a later snippet
 * reusing a name an earlier one chose shadows it instead of colliding with it.
 *
 * Imports accumulate from every snippet, not only the `SHARED` ones: a reader
 * working down the page has already seen them, so a snippet that relies on an
 * import shown earlier is not an example that lies. Declarations are different —
 * they accumulate only where a snippet says so, because two snippets are free to
 * reuse a name like `user` for unrelated things.
 */
export const renderDocExampleFixtures = (
  args: RenderDocExampleFixturesArgs,
): ReadonlyArray<DocExampleFixture> => {
  const fixtures: Array<DocExampleFixture> = [];
  const sharedRegions: Array<FixtureRegion> = [];
  let carriedBindings: ReadonlyArray<ImportBinding> = [];

  args.examples.forEach((example) => {
    const { bindings, body } = splitCodeImports({
      code: example.code,
      location: { sourcePath: example.sourcePath, line: example.line },
    });
    const allBindings = mergeImportBindings([...carriedBindings, ...bindings]);
    carriedBindings = allBindings;

    const parts: Array<string> = [
      `// Generated from ${example.sourcePath}:${example.line}.`,
      `// Do not edit — run \`pnpm --filter docs examples:extract\` after editing that source.`,
    ];

    const importLines = renderImportBindings(allBindings);
    if (importLines.length > 0) parts.push('', ...importLines);

    sharedRegions.forEach((region) => {
      parts.push('', `// ${example.sourcePath}:${region.line}`, region.code);
    });

    if (body.length > 0) {
      const marker = `// ${example.sourcePath}:${example.line}`;
      if (example.shared || sharedRegions.length === 0) parts.push('', marker, body);
      else parts.push('', marker, '{', body, '}');
    }

    fixtures.push({
      path: `${args.fixtureStem}-L${example.line}.ts`,
      contents: `${parts.join('\n')}\n`,
    });

    if (example.shared && body.length > 0) {
      sharedRegions.push({ line: example.line, code: body });
    }
  });

  return fixtures;
};
