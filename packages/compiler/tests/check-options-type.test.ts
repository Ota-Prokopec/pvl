// `CHECK_OPTIONS_TYPE_STRING`, the type a Compiled Schema's constructor
// declares a check's options with, is `@pcvl/schema`'s `CheckOptions` spelled
// by hand, so it is parsed and type-checked here against that type, which
// fails on any drift: a field added, removed or retyped, or a typo.
import * as path from 'node:path';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { CHECK_OPTIONS_TYPE_STRING } from '../src/emitters/consts/checkOptions.js';
import { createFixture, linkSchemaPackage } from './helpers.js';

// Exact equality: mutual assignability would miss an added optional key, and
// the mapped type flattens an intersection, which the check would otherwise
// tell apart from the same object written out.
const TYPE_CHECK_FILE = [
  "import type { CheckOptions } from '@pcvl/schema';",
  'type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
  `type Spelled = ${CHECK_OPTIONS_TYPE_STRING};`,
  'true satisfies Equals<Spelled, { [Key in keyof CheckOptions]: CheckOptions[Key] } | undefined>;',
].join('\n');

describe('CHECK_OPTIONS_TYPE_STRING', () => {
  it('spells `CheckOptions | undefined` exactly', async () => {
    const root = await createFixture({});
    await linkSchemaPackage(root);
    const project = new Project({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
      },
    });
    project.createSourceFile(path.join(root, 'checkOptions.ts'), TYPE_CHECK_FILE);

    expect(
      project
        .getPreEmitDiagnostics()
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, ' '),
        ),
    ).toEqual([]);
  });
});
