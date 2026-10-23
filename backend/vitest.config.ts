import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts', 'test/setup-teardown.ts'],
    // All test files share one throwaway database — run them one at a time.
    fileParallelism: false,
    pool: 'forks',
    // Один процесс за раз с потолком кучи: контейнер скрипта test-backend.sh ограничен 1.5 ГБ, а без потолка
    // Node держит всю память до GC и прогон убивало по OOM (код 137).
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=768'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
