import * as fsPromises from 'node:fs/promises';
import { defineConfig } from 'tsup';

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
  // `@pcvl/compiler/json-schema`, shipped as written.
  onSuccess: async (): Promise<void> => {
    await fsPromises.copyFile('src/config/json-schema.json', 'dist/json-schema.json');
  },
});
