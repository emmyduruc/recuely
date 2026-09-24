import { defineConfig } from 'vitest/config';

// API integration tests: the built server against the Neon test DB (SPEC.md §C1.1).
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
