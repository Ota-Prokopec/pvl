import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';
import { configJsonSchema } from './src/jsonSchema.js';

export default defineConfig({
  // `bin.ts` is the `pvl` executable `package.json`'s `bin` points at.
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  // Declarations are emitted separately via `tsc --project tsconfig.build.json`
  // (see the "build" script) — tsup's bundled rollup-plugin-dts doesn't yet
  // support the TypeScript version this repo is pinned to.
  dts: false,
  sourcemap: true,
  clean: true,
  // `@pvl/schema-compiler/json-schema`, generated from the same `configSchema`
  // the compiler validates `pvlconfig.json` with.
  onSuccess: async (): Promise<void> => {
    await writeFile('dist/json-schema.json', `${JSON.stringify(configJsonSchema(), null, 2)}\n`);
  },
});
