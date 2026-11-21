import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The integration test builds the bundle in its setup.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
