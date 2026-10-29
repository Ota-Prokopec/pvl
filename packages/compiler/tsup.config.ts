import * as fsPromises from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  // `bin.ts` is the `pvl` executable `package.json`'s `bin` points at.
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  // Declarations inline the private `@repo/types`, so the published ones
  // reference only real dependencies (ADR-0048).
  dts: { resolve: ['@repo/types'] },
  sourcemap: true,
  clean: true,
  // `@pcvl/compiler/json-schema`, shipped as written.
  onSuccess: async (): Promise<void> => {
    await fsPromises.copyFile('src/config/json-schema.json', 'dist/json-schema.json');
  },
});
