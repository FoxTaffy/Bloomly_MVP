import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    // All test files share one throwaway database — run them one at a time.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
