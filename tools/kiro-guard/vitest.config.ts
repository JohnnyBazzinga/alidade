import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Some tests spawn git or node; the limit would measure the machine, not the code.
    testTimeout: 60_000,
  },
});
