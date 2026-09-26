import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // DB-backed tests must not run in parallel
    fileParallelism: false,
  },
});
