// Deeply nested Schemas: how the emitted output grows with depth, and the
// path a failure at any depth is reported at.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCompilation } from '../src/index.js';
import {
  configJson,
  createFixture,
  describeResult,
  type CompiledFixture,
  linkSchemaPackage,
  readFixtureFile,
  schemaFile,
  type SchemasModule,
} from './helpers.js';

/**
 * A Schema `depth` levels deep, alternating an object and an array around a
 * string.
 *
 * ```ts
 * deepSchema(2) // 'pvl.array(pvl.object({ next: pvl.string().min(1), name: pvl.string() }).strict()).min(1)'
 * ```
 */
const deepSchema = (depth: number): string => {
  if (depth === 0) {
    return 'pvl.string().min(1)';
  }
  return depth % 2 === 1
    ? `pvl.object({ next: ${deepSchema(depth - 1)}, name: pvl.string() }).strict()`
    : `pvl.array(${deepSchema(depth - 1)}).min(1)`;
};
/**
 * A value that fits `deepSchema(depth)`, or holds `null` at `brokenDepth`.
 *
 * ```ts
 * deepValue(2)    // [{ next: 'leaf', name: 'n' }]
 * deepValue(2, 1) // [null]
 * ```
 */
const deepValue = (depth: number, brokenDepth?: number): unknown => {
  if (depth === brokenDepth) {
    return null;
  }
  if (depth === 0) {
    return 'leaf';
  }
  return depth % 2 === 1
    ? { next: deepValue(depth - 1, brokenDepth), name: 'n' }
    : [deepValue(depth - 1, brokenDepth)];
};

/** A fixture exporting `deepSchema(depth)` compiled, with its compile payload and emitted module. */
const compileDeepFixture = async (
  depth: number,
): Promise<CompiledFixture & { emitted: string | undefined }> => {
  const root = await createFixture({
    'pvlconfig.json': configJson({}),
    'src/schemas/deep.ts': schemaFile(`export const deep = pvl.compile(${deepSchema(depth)});`),
  });
  const payload = await runCompilation({ cwd: root });
  return { root, payload, emitted: await readFixtureFile(root, '.pvl/schemas/deep.ts') };
};

describe('runCompilation(): deeply nested Schemas', () => {
  it('emits output that grows linearly with depth, not faster', async () => {
    // Indentation is left out: each nested block indents its lines once
    // more, which a bundler strips, and is all that grows with depth.
    const [shallow, middle, deep] = await Promise.all(
      [8, 16, 32].map(
        async (depth) =>
          ((await compileDeepFixture(depth)).emitted ?? '').replaceAll(/^ +/gm, '').length,
      ),
    );

    // Each level emits about as much at depth 32 as at depth 8: a path or a
    // name written out in full at every level would make it grow per level.
    const perLevelShallow = (middle! - shallow!) / 8;
    const perLevelDeep = (deep! - middle!) / 16;
    expect(perLevelDeep).toBeLessThan(perLevelShallow * 1.1);
  });

  it('reports a failure at every depth at the path the interpreted Schema does', async () => {
    const depth = 12;
    const { root, payload } = await compileDeepFixture(depth);
    await linkSchemaPackage(root);
    const interpreted = (await import(path.join(root, 'src/schemas/deep.ts'))) as SchemasModule;
    const compiled = (await import(path.join(root, '.pvl/schemas/deep.ts'))) as SchemasModule;

    expect(payload.diagnostics).toEqual([]);
    for (const value of [
      deepValue(depth),
      ...Array.from({ length: depth + 1 }, (_, brokenDepth) => deepValue(depth, brokenDepth)),
    ]) {
      expect(describeResult(compiled.deep!.validate(value))).toStrictEqual(
        describeResult(interpreted.deep!.validate(value)),
      );
    }
  });
});
