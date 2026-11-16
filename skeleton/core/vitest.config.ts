import { configDefaults, defineConfig } from 'vitest/config';

/** The timing test runs on its own, through `vitest.perf.config.ts` (design §9). */
export const PERFORMANCE_TESTS = ['src/performance.test.ts'];

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, ...PERFORMANCE_TESTS],
    // Applies the shared fast-check configuration (at least 200 runs per property).
    setupFiles: ['src/test-support/fast-check-setup.ts'],
    coverage: {
      // Test support is not part of the public API.
      exclude: ['src/test-support/**'],
    },
  },
});
