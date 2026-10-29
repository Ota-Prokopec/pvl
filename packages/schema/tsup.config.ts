import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  // Declarations inline the private `@repo/types`, so the published ones
  // reference only real dependencies (ADR-0048).
  dts: { resolve: ['@repo/types'] },
  sourcemap: true,
  clean: true,
});
