import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        // Each test mutates AFTERGLOW_ROOT, so isolate per-file.
        singleFork: false,
      },
    },
  },
});
