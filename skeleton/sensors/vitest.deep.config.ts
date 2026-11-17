import { defineConfig } from 'vitest/config';

/** Cases per property in the checkpoint run (design §8). */
export const DEEP_PROPERTY_RUNS = 100_000;

// The checkpoint run: properties only, at 100 000 cases (10 000 for the properties that cap
// themselves), one file at a time so that the reports of worst errors are not interleaved.
// Run with `pnpm --filter @alidade/sensors test:deep`; it is not part of `pnpm test`.
export default defineConfig({
  test: {
    include: ['src/**/*.property.test.ts'],
    provide: { propertyRuns: DEEP_PROPERTY_RUNS },
    setupFiles: ['src/test-support/fast-check-setup.ts'],
    fileParallelism: false,
    testTimeout: 0,
    hookTimeout: 0,
  },
});
