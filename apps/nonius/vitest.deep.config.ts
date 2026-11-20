import { defineConfig } from 'vitest/config';

/** Cases per property in the checkpoint run. Each property has its own cap (design §11). */
export const DEEP_PROPERTY_RUNS = 100_000;

// The checkpoint run: the property files of the `math`, `adapters` and `components` projects at
// the second count, one file at a time so that the reports of worst errors are not interleaved,
// with no time limit. Run with `pnpm --filter @alidade/nonius test:deep`.
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
          include: ['src/**/*.property.test.ts'],
          exclude: ['src/**/adapters/**', 'src/components/**'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: ['src/**/adapters/**/*.property.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/components/**/*.property.test.{ts,tsx}'],
          setupFiles: ['src/test-support/fast-check-setup.ts', 'src/test-support/dom-setup.ts'],
        },
      },
    ],
  },
});
