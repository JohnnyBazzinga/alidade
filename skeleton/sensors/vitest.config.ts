import { defineConfig } from 'vitest/config';

/** Cases per property in the default run (testing.md rule 7). */
export const DEFAULT_PROPERTY_RUNS = 200;

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The shared fast-check configuration reads this value (design §8).
    provide: { propertyRuns: DEFAULT_PROPERTY_RUNS },
    setupFiles: ['src/test-support/fast-check-setup.ts'],
    // Several properties take 2 to 4 s each at 200 cases; on the shared machine under load
    // (average 16) one crossed Vitest's 5 s default. The limit would measure the machine, not the
    // code, as for Core's timing test, so it is raised; case counts and tolerances are unchanged.
    testTimeout: 60_000,
    coverage: {
      // Test support is not part of the public API.
      exclude: ['src/test-support/**'],
    },
  },
});
