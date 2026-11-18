import { defineConfig } from 'vitest/config';

/** Cases per property in the default run (testing.md rule 7). */
export const DEFAULT_PROPERTY_RUNS = 200;

// Three projects, one per layer (design D1): the folders are the layers, so the environment is
// chosen by the folder and a Math test cannot silently run in a DOM.
export default defineConfig({
  test: {
    provide: { propertyRuns: DEFAULT_PROPERTY_RUNS },
    // Several properties take seconds at 200 cases on the shared machine; the limit would measure
    // the machine, not the code (as in Sensors). Case counts and tolerances are unchanged.
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'math',
          environment: 'node',
          include: ['src/*.test.ts', 'src/math/**/*.test.ts', 'src/test-support/**/*.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: ['src/adapters/**/*.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/components/**/*.test.tsx', 'playground/**/*.test.tsx'],
          setupFiles: ['src/test-support/fast-check-setup.ts'],
        },
      },
    ],
  },
});
