import { describe, expect, it } from 'vitest';

import {
  DOC_EXAMPLE_MARKER,
  parseMarkdownExamples,
  parseTsdocExamples,
  renderDocExampleFixtures,
  type DocExample,
} from '../scripts/docExamples.ts';

const SOURCE_PATH = 'apps/docs/content/guide/example.md' as const;

describe('parseMarkdownExamples', () => {
  it('extracts a fenced ts block', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['# Title', '', '```ts', "const a = 'b';", '```', ''].join('\n'),
    });

    expect(examples).toEqual([
      { sourcePath: SOURCE_PATH, line: 4, code: "const a = 'b';", shared: false },
    ]);
  });

  it('accepts `typescript` as well as `ts`', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['```typescript', 'const a = 1;', '```'].join('\n'),
    });

    expect(examples).toHaveLength(1);
  });

  it('ignores fences in other languages', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['```sh', 'pnpm add @pvl/schema', '```', '', '```', 'plain', '```'].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('records the line of the first code line, not of the fence', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['', '', '', '```ts', 'const a = 1;', '```'].join('\n'),
    });

    expect(examples[0]?.line).toBe(5);
  });

  it('finds a fence nested inside a VitePress container', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['::: danger Careful', '```ts', 'const a = 1;', '```', ':::'].join('\n'),
    });

    expect(examples).toHaveLength(1);
  });

  it('extracts every fence in document order', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['```ts', 'const a = 1;', '```', '', '```ts', 'const b = 2;', '```'].join('\n'),
    });

    expect(examples.map((example) => example.code)).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('omits a snippet marked skip', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: [`\`\`\`ts ${DOC_EXAMPLE_MARKER.SKIP}`, 'this is not real code', '```'].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('marks a snippet marked shared', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: [`\`\`\`ts ${DOC_EXAMPLE_MARKER.SHARED}`, 'const a = 1;', '```'].join('\n'),
    });

    expect(examples[0]?.shared).toBe(true);
  });

  // A `ts` block is a `ts` block however VitePress lets it be spelled. Missing
  // one of these forms would silently stop checking it, which is the one thing
  // the default must never do.
  it.each([
    ['```ts:line-numbers'],
    ['```ts:no-line-numbers'],
    ['```ts:line-numbers=2'],
    ['```ts{1,3}'],
    ['```ts-vue'],
    ['```ts [config.ts]'],
    ['```ts{1,3} [config.ts]'],
  ])('extracts a ts block written as %s', (fence) => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: [fence, 'const a = 1;', '```'].join('\n'),
    });

    expect(examples).toHaveLength(1);
  });

  it('still ignores another language carrying VitePress meta', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: ['```sh:line-numbers', 'pnpm add @pvl/schema', '```'].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('honours a marker on a fence whose language carries meta', () => {
    const examples = parseMarkdownExamples({
      sourcePath: SOURCE_PATH,
      text: [`\`\`\`ts:line-numbers ${DOC_EXAMPLE_MARKER.SHARED}`, 'const a = 1;', '```'].join(
        '\n',
      ),
    });

    expect(examples[0]?.shared).toBe(true);
  });

  it('rejects an unknown marker in the docs-check namespace', () => {
    expect(() =>
      parseMarkdownExamples({
        sourcePath: SOURCE_PATH,
        text: ['```ts docs-check-skipp', 'const a = 1;', '```'].join('\n'),
      }),
    ).toThrow(/unknown documentation-example marker `docs-check-skipp`/);
  });

  it('rejects skip and shared on the same fence', () => {
    expect(() =>
      parseMarkdownExamples({
        sourcePath: SOURCE_PATH,
        text: [
          `\`\`\`ts ${DOC_EXAMPLE_MARKER.SKIP} ${DOC_EXAMPLE_MARKER.SHARED}`,
          'const a = 1;',
          '```',
        ].join('\n'),
      }),
    ).toThrow(/contradict/);
  });

  it('rejects an unterminated fence', () => {
    expect(() =>
      parseMarkdownExamples({
        sourcePath: SOURCE_PATH,
        text: ['```ts', 'const a = 1;'].join('\n'),
      }),
    ).toThrow(/unterminated code fence/);
  });
});

const TS_SOURCE_PATH = 'packages/schema/src/schemas/stringSchema.ts' as const;

describe('parseTsdocExamples', () => {
  it('extracts an @example fence and strips the TSDoc prefix', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: [
        '/**',
        ' * Accepts a string.',
        ' *',
        ' * @example',
        ' * ```ts',
        " * import { pvl } from '@pvl/schema';",
        ' *',
        ' * pvl.string();',
        ' * ```',
        ' */',
        'export class StringSchema {}',
      ].join('\n'),
    });

    expect(examples).toEqual([
      {
        sourcePath: TS_SOURCE_PATH,
        line: 6,
        code: ["import { pvl } from '@pvl/schema';", '', 'pvl.string();'].join('\n'),
        shared: false,
      },
    ]);
  });

  it('extracts an @example from every TSDoc block in the file', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: [
        '/**',
        ' * @example',
        ' * ```ts',
        ' * const a = 1;',
        ' * ```',
        ' */',
        'export const a = 1;',
        '',
        '/**',
        ' * @example',
        ' * ```ts',
        ' * const b = 2;',
        ' * ```',
        ' */',
        'export const b = 2;',
      ].join('\n'),
    });

    expect(examples.map((example) => example.code)).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('ignores a TSDoc block with no @example', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: ['/**', ' * Just prose.', ' */', 'export const a = 1;'].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('ignores a single-line TSDoc block', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: ['/** @internal */', 'export const a = 1;'].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('ignores a fenced block that does not follow @example', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: ['/**', ' * ```ts', ' * const a = 1;', ' * ```', ' */', 'export const a = 1;'].join(
        '\n',
      ),
    });

    expect(examples).toEqual([]);
  });

  it('stops collecting at the tag following @example', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: [
        '/**',
        ' * @example',
        ' * @deprecated',
        ' * ```ts',
        ' * const a = 1;',
        ' * ```',
        ' */',
        'export const a = 1;',
      ].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('honours the skip marker', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: [
        '/**',
        ' * @example',
        ` * \`\`\`ts ${DOC_EXAMPLE_MARKER.SKIP}`,
        ' * not real code',
        ' * ```',
        ' */',
        'export const a = 1;',
      ].join('\n'),
    });

    expect(examples).toEqual([]);
  });

  it('rejects an unterminated fence inside an @example', () => {
    expect(() =>
      parseTsdocExamples({
        sourcePath: TS_SOURCE_PATH,
        text: [
          '/**',
          ' * @example',
          ' * ```ts',
          ' * const a = 1;',
          ' */',
          'export const a = 1;',
        ].join('\n'),
      }),
    ).toThrow(/unterminated code fence/);
  });

  it('preserves a blank TSDoc line with no trailing space', () => {
    const examples = parseTsdocExamples({
      sourcePath: TS_SOURCE_PATH,
      text: [
        '/**',
        ' * @example',
        ' * ```ts',
        ' * const a = 1;',
        ' *',
        ' * const b = 2;',
        ' * ```',
        ' */',
        'export const a = 1;',
      ].join('\n'),
    });

    expect(examples[0]?.code).toBe(['const a = 1;', '', 'const b = 2;'].join('\n'));
  });
});

const example = (overrides: Partial<DocExample>): DocExample => ({
  sourcePath: SOURCE_PATH,
  line: 1,
  code: 'const a = 1;',
  shared: false,
  ...overrides,
});

describe('renderDocExampleFixtures', () => {
  it('writes one fixture per example, named for its source line', () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [example({ line: 4 }), example({ line: 9, code: 'const b = 2;' })],
    });

    expect(fixtures.map((fixture) => fixture.path)).toEqual([
      'guide/example-L4.ts',
      'guide/example-L9.ts',
    ]);
  });

  it('heads each fixture with the source location it came from', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [example({ line: 4 })],
    });

    expect(fixture?.contents).toContain(`Generated from ${SOURCE_PATH}:4`);
  });

  it('hoists an import out of the snippet body', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ code: ["import { pvl } from '@pvl/schema';", '', 'pvl.string();'].join('\n') }),
      ],
    });

    expect(fixture?.contents).toContain("import { pvl } from '@pvl/schema';");
    expect(fixture?.contents).toContain('pvl.string();');
  });

  it('carries a shared example forward into the fixtures that follow it', () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({
          line: 4,
          shared: true,
          code: ["import { pvl } from '@pvl/schema';", '', 'const user = pvl.string();'].join('\n'),
        }),
        example({ line: 9, code: 'user.validate(42);' }),
      ],
    });

    expect(fixtures[1]?.contents).toContain('const user = pvl.string();');
    expect(fixtures[1]?.contents).toContain('user.validate(42);');
  });

  it('scopes a following example so it can shadow a shared declaration', () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ line: 4, shared: true, code: 'const user = 1;' }),
        example({ line: 9, code: "const user = 'shadowed';" }),
      ],
    });

    expect(fixtures[1]?.contents).toContain(['{', "const user = 'shadowed';", '}'].join('\n'));
  });

  it('leaves an example unwrapped when there is no shared context to collide with', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [example({ code: 'const user = 1;' })],
    });

    expect(fixture?.contents).not.toContain('{\nconst user = 1;\n}');
  });

  it('does not emit an empty region for a shared example that is only an import', () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ line: 4, shared: true, code: "import { pvl } from '@pvl/schema';" }),
        example({ line: 9, code: 'pvl.string();' }),
      ],
    });

    expect(fixtures[1]?.contents).toContain("import { pvl } from '@pvl/schema';");
    expect(fixtures[1]?.contents).not.toContain('{\n\n}');
    expect(fixtures[1]?.contents).not.toContain('{\npvl.string();\n}');
  });

  it("carries an unshared example's imports forward, since the reader has seen them", () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ line: 4, code: "import { pvl } from '@pvl/schema';" }),
        example({ line: 9, code: 'pvl.string();' }),
      ],
    });

    expect(fixtures[1]?.contents).toContain("import { pvl } from '@pvl/schema';");
  });

  it("does not carry an unshared example's declarations forward", () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ line: 4, code: 'const user = 1;' }),
        example({ line: 9, code: 'const other = 2;' }),
      ],
    });

    expect(fixtures[1]?.contents).not.toContain('const user = 1;');
  });

  it('merges the same binding imported by both a shared and a later example', () => {
    const fixtures = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ line: 4, shared: true, code: "import { pvl } from '@pvl/schema';" }),
        example({
          line: 9,
          code: ["import { pvl } from '@pvl/schema';", 'pvl.string();'].join('\n'),
        }),
      ],
    });

    expect(fixtures[1]?.contents.match(/import \{ pvl \} from '@pvl\/schema';/g)).toHaveLength(1);
  });

  it('merges differing bindings from one module into a single import', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({
          code: [
            "import { pvl } from '@pvl/schema';",
            "import type { Result } from '@pvl/schema';",
            'pvl.string();',
          ].join('\n'),
        }),
      ],
    });

    expect(fixture?.contents).toContain("import { pvl, type Result } from '@pvl/schema';");
  });

  it('keeps imports from different modules apart', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({
          code: [
            "import type { StandardSchemaV1 } from '@standard-schema/spec';",
            "import { pvl } from '@pvl/schema';",
            'pvl.string();',
          ].join('\n'),
        }),
      ],
    });

    expect(fixture?.contents).toContain(
      "import { type StandardSchemaV1 } from '@standard-schema/spec';",
    );
    expect(fixture?.contents).toContain("import { pvl } from '@pvl/schema';");
  });

  it('lets a value import win over a type-only import of the same name', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({
          code: [
            "import type { Schema } from '@pvl/schema';",
            "import { Schema } from '@pvl/schema';",
            'const a: Schema<string, string> | undefined = undefined;',
          ].join('\n'),
        }),
      ],
    });

    expect(fixture?.contents).toContain("import { Schema } from '@pvl/schema';");
    expect(fixture?.contents).not.toContain('type Schema');
  });

  it('preserves an aliased import', () => {
    const [fixture] = renderDocExampleFixtures({
      fixtureStem: 'guide/example',
      examples: [
        example({ code: ["import { pvl as p } from '@pvl/schema';", 'p.string();'].join('\n') }),
      ],
    });

    expect(fixture?.contents).toContain("import { pvl as p } from '@pvl/schema';");
  });

  it('rejects a multi-line import', () => {
    expect(() =>
      renderDocExampleFixtures({
        fixtureStem: 'guide/example',
        examples: [
          example({
            code: ['import {', '  pvl,', "} from '@pvl/schema';", 'pvl.string();'].join('\n'),
          }),
        ],
      }),
    ).toThrow(/single line/);
  });

  it('rejects a default import', () => {
    expect(() =>
      renderDocExampleFixtures({
        fixtureStem: 'guide/example',
        examples: [example({ code: "import pvl from '@pvl/schema';" })],
      }),
    ).toThrow(/unsupported import form/);
  });

  it('rejects a namespace import', () => {
    expect(() =>
      renderDocExampleFixtures({
        fixtureStem: 'guide/example',
        examples: [example({ code: "import * as pvl from '@pvl/schema';" })],
      }),
    ).toThrow(/unsupported import form/);
  });

  it('rejects a side-effect-only import', () => {
    expect(() =>
      renderDocExampleFixtures({
        fixtureStem: 'guide/example',
        examples: [example({ code: "import '@pvl/schema';" })],
      }),
    ).toThrow(/unsupported import form/);
  });
});
