import { defineConfig } from 'vitest/config';

// Integration tests against the Neon test DB (SPEC.md §C1.1): one schema per run, files run serially.
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
