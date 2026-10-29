import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Each test builds a TypeScript program over a fixture on disk, which
    // can stall past the 5s default while `pnpm test` builds in parallel.
    testTimeout: 30_000,
  },
});
