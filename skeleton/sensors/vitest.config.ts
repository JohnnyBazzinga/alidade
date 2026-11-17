import { defineConfig } from 'vitest/config';

/** Cases per property in the default run (testing.md rule 7). */
export const DEFAULT_PROPERTY_RUNS = 200;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The shared fast-check configuration reads this value (design §8).
    provide: { propertyRuns: DEFAULT_PROPERTY_RUNS },
    setupFiles: ['src/test-support/fast-check-setup.ts'],
    coverage: {
      // Test support is not part of the public API.
      exclude: ['src/test-support/**'],
    },
  },
});
