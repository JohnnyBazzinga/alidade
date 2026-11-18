import { defineConfig } from 'vitest/config';

/** Cases per property in the checkpoint run (design §8). */
export const DEEP_PROPERTY_RUNS = 100_000;

// The checkpoint run: the property files of the `math` and `adapters` projects at 100 000 cases
// (the capped properties cap themselves), one file at a time so that the reports of worst errors
// are not interleaved. Run with `pnpm --filter @alidade/ui test:deep`.
export default defineConfig({
  test: {
    provide: { propertyRuns: DEEP_PROPERTY_RUNS },
    fileParallelism: false,
    silent: false,
    testTimeout: 0,
    hookTimeout: 0,
    projects: [
      {
        extends: true,
        test: {
          name: 'math',
          environment: 'node',
          include: ['src/**/*.property.test.ts', '!src/adapters/**'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: ['src/adapters/**/*.property.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
    ],
  },
});
