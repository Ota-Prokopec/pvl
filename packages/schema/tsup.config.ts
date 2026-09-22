import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  // Declarations are emitted separately via `tsc --project tsconfig.build.json`
  // (see the "build" script) — tsup's bundled rollup-plugin-dts doesn't yet
  // support the TypeScript version this repo is pinned to.
  dts: false,
  sourcemap: true,
  clean: true,
})
