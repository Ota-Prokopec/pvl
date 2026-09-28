// Writes the documentation's code examples out as compilable TypeScript.
//
// This is the filesystem shell around `docExamples.ts`: it finds the sources,
// hands their text to the parsers, and writes the rendered fixtures into
// `examples/`, which `check-types:examples` then compiles. See this package's
// AGENTS.md for how to read a failure and how a snippet opts out.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseMarkdownExamples,
  parseTsdocExamples,
  renderDocExampleFixtures,
  type DocExample,
} from './docExamples.ts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'examples');
const GUIDE_DIR = path.join(PACKAGE_ROOT, 'content', 'guide');
const SCHEMA_SOURCE_DIR = path.join(REPO_ROOT, 'packages', 'schema', 'src');

/** A documentation file to extract examples from, and how to name what comes out. */
type DocSource = {
  readonly absolutePath: string;
  /** Repo-relative, so a fixture's header points somewhere a reader can open. */
  readonly sourcePath: string;
  readonly fixtureStem: string;
  readonly parse: (args: {
    readonly sourcePath: string;
    readonly text: string;
  }) => ReadonlyArray<DocExample>;
};

type CollectSourcesArgs = {
  readonly rootDir: string;
  readonly extension: string;
  readonly fixturePrefix: string;
  readonly parse: DocSource['parse'];
};

const collectSources = async (args: CollectSourcesArgs): Promise<ReadonlyArray<DocSource>> => {
  const entries = await readdir(args.rootDir, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(args.extension))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
    .map((absolutePath) => {
      const relative = path.relative(args.rootDir, absolutePath).split(path.sep).join('/');
      const stem = relative.slice(0, -args.extension.length);
      return {
        absolutePath,
        sourcePath: path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/'),
        fixtureStem: `${args.fixturePrefix}/${stem}`,
        parse: args.parse,
      };
    });
};

const main = async (): Promise<void> => {
  const sources = [
    ...(await collectSources({
      rootDir: GUIDE_DIR,
      extension: '.md',
      fixturePrefix: 'guide',
      parse: parseMarkdownExamples,
    })),
    ...(await collectSources({
      rootDir: SCHEMA_SOURCE_DIR,
      extension: '.ts',
      fixturePrefix: 'api',
      parse: parseTsdocExamples,
    })),
  ];

  await rm(FIXTURE_DIR, { recursive: true, force: true });
  await mkdir(FIXTURE_DIR, { recursive: true });

  let written = 0;

  for (const source of sources) {
    const text = await readFile(source.absolutePath, 'utf8');
    const examples = source.parse({ sourcePath: source.sourcePath, text });
    const fixtures = renderDocExampleFixtures({ examples, fixtureStem: source.fixtureStem });

    for (const fixture of fixtures) {
      const target = path.join(FIXTURE_DIR, fixture.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, fixture.contents, 'utf8');
      written += 1;
    }
  }

  console.log(
    `Extracted ${written} documentation example(s) from ${sources.length} source file(s) into ${path.relative(REPO_ROOT, FIXTURE_DIR)}.`,
  );
};

await main();
