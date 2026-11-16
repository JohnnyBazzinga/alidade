import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Applies the shared fast-check configuration (at least 200 runs per property).
    setupFiles: ['src/test-support/fast-check-setup.ts'],
    coverage: {
      // Test support is not part of the public API.
      exclude: ['src/test-support/**'],
    },
  },
});
