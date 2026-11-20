import { defineConfig } from 'vitest/config';

/** Cases per property in the default run (testing.md rule 7). */
export const DEFAULT_PROPERTY_RUNS = 200;

// Three projects, one per layer (design D1): the layer of a file is the nearest folder named
// `math`, `adapters` or `components` on its path, so the environment is chosen by the folder and a
// Math test cannot silently run in a DOM.
export default defineConfig({
  test: {
    provide: { propertyRuns: DEFAULT_PROPERTY_RUNS },
    // Some properties take seconds at 200 cases on a shared machine; a limit would measure the
    // machine, not the code. Case counts and tolerances are unchanged.
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'math',
          environment: 'node',
          include: ['src/*.test.ts', 'src/**/math/**/*.test.ts', 'src/test-support/**/*.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: ['src/**/adapters/**/*.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/components/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test-support/fast-check-setup.ts', 'src/test-support/dom-setup.ts'],
        },
      },
    ],
  },
});
