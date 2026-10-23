/** Shared setup for the rule tests: both rule testers wired to vitest, and on-disk fixtures. */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { RuleTester as TypeScriptRuleTester } from '@typescript-eslint/rule-tester';
import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';

TypeScriptRuleTester.afterAll = afterAll;
TypeScriptRuleTester.describe = describe;
TypeScriptRuleTester.it = it;
TypeScriptRuleTester.itOnly = it.only;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** Runs the TypeScript-source rules. */
export const typescriptTester = new TypeScriptRuleTester();

/** Runs the `package.json`/`tsconfig.json` rules. */
export const jsonTester = new RuleTester({ plugins: { json }, language: 'json/json' });

/** Runs the `tsconfig*.json` rules, which allow comments. */
export const jsoncTester = new RuleTester({ plugins: { json }, language: 'json/jsonc' });

/** Runs the `AGENTS.md` rules. */
export const markdownTester = new RuleTester({ plugins: { markdown }, language: 'markdown/gfm' });

/** Writes `files` (path relative to a fresh temporary directory → content) and returns that directory. */
export const createFixture = (files: Record<string, string>): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conventions-'));
  for (const [filePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, filePath)), { recursive: true });
    fs.writeFileSync(path.join(root, filePath), content);
  }
  return root;
};
