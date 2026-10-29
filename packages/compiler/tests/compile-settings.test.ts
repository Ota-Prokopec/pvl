// How a run resolves its settings, through `runCompilation()`: the
// defaults, the config file, overrides, and the directory relative paths
// resolve from.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCompilation } from '../src/index.js';
import { SCHEMA_FILE } from './consts.js';
import { configJson, createFixture, listFixtureFiles, readFixtureFile } from './helpers.js';

describe('runCompilation(): settings', () => {
  it('applies the defaults when the config sets nothing', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.settings).toEqual({
      include: ['src/schemas/**/*.ts'],
      rootDir: 'src',
      destination: undefined,
    });
  });

  it('reads every setting from the config file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({
        $schema: './node_modules/@pcvl/compiler/dist/json-schema.json',
        include: ['schemas/*.ts'],
        rootDir: 'schemas',
        destination: 'out',
      }),
      'schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.settings).toEqual({
      include: ['schemas/*.ts'],
      rootDir: 'schemas',
      destination: 'out',
    });
  });

  it('lets an override win over the config file, setting by setting', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({
        include: ['schemas/*.ts'],
        rootDir: '.',
        destination: 'from-config',
      }),
      'schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({
      cwd: root,
      overrides: { rootDir: 'schemas', destination: 'from-override' },
    });

    expect(payload.settings).toEqual({
      include: ['schemas/*.ts'],
      rootDir: 'schemas',
      destination: 'from-override',
    });
    expect(await readFixtureFile(root, 'from-override/user.ts')).toContain('@generated');
    expect(await listFixtureFiles(root, 'from-config')).toBe(undefined);
  });

  it('runs with no config file when overrides are given, resolving paths from the working directory', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const payload = await runCompilation({ cwd: root, overrides: { destination: 'out' } });

    expect(payload.diagnostics).toEqual([]);
    expect(payload.destination).toBe(path.join(root, 'out'));
    expect(await readFixtureFile(root, 'out/schemas/user.ts')).toContain('@generated');
  });

  it("resolves relative paths from the config file's directory, wherever it is run from", async () => {
    const files = {
      'apps/web/pvlconfig.json': configJson({ include: ['src/schemas/*.ts'] }),
      'apps/web/src/schemas/user.ts': SCHEMA_FILE,
    };
    const fromRepoRoot = await createFixture(files);
    const fromApp = await createFixture(files);

    const rootPayload = await runCompilation({
      cwd: fromRepoRoot,
      configPath: 'apps/web/pvlconfig.json',
    });
    const appPayload = await runCompilation({ cwd: path.join(fromApp, 'apps/web') });

    expect(rootPayload.diagnostics).toEqual([]);
    expect(appPayload.diagnostics).toEqual([]);
    expect(rootPayload.destination).toBe(path.join(fromRepoRoot, 'apps/web/.pvl'));
    expect(appPayload.destination).toBe(path.join(fromApp, 'apps/web/.pvl'));
    expect(await readFixtureFile(fromRepoRoot, 'apps/web/.pvl/schemas/user.ts')).toBe(
      await readFixtureFile(fromApp, 'apps/web/.pvl/schemas/user.ts'),
    );
  });

  it('never scans node_modules', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['**/*.ts'], rootDir: '.' }),
      'src/user.ts': SCHEMA_FILE,
      'node_modules/dep/index.ts': 'console.log("side effect");\n',
    });

    const payload = await runCompilation({ cwd: root });

    // `index.ts` exports nothing, so scanning it would have warned.
    expect(payload.diagnostics).toEqual([]);
  });
});
