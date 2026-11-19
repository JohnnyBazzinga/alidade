import { defineConfig } from 'vitest/config';

/** The empty Overlays module of the cut build (design D21). */
const OVERLAYS_EMPTY = decodeURIComponent(
  new URL('./src/overlays-empty.ts', import.meta.url).pathname,
);

/** Cases per property in the default run (testing.md rule 7). */
export const DEFAULT_PROPERTY_RUNS = 200;

// Three projects, one per layer (design D1, §13): the layer of a file is the nearest folder named
// `math`, `adapters` or `components` on its path, so the environment is chosen by the folder and a
// Math test cannot silently run in a DOM. The fourth, `no-overlays` (design D21, Req 1.10), runs
// the `math` and `components` tests but the Overlays' own with the registry `src/overlays`
// replaced by `src/overlays-empty.ts`. Only `src/App.tsx` imports the registry (a purity rule), as
// `./overlays`; the alias takes that specifier, and `../overlays` for the cut test itself.
export default defineConfig({
  test: {
    provide: { propertyRuns: DEFAULT_PROPERTY_RUNS, overlaysCut: false },
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
          include: [
            'src/components/**/*.test.{ts,tsx}',
            'src/overlays/**/components/**/*.test.{ts,tsx}',
          ],
          setupFiles: ['src/test-support/fast-check-setup.ts', 'src/test-support/dom-setup.ts'],
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: /^(?:\.{1,2}\/)+overlays(?:\/index(?:\.ts)?)?$/,
              replacement: OVERLAYS_EMPTY,
            },
          ],
        },
        test: {
          name: 'no-overlays',
          environment: 'jsdom',
          provide: { overlaysCut: true },
          include: [
            'src/*.test.ts',
            'src/**/math/**/*.test.ts',
            'src/test-support/**/*.test.ts',
            'src/components/**/*.test.{ts,tsx}',
          ],
          // The purity scan reads the sources and `.env.example` as text, which no alias changes;
          // Vite refuses to serve `.env*` files in its browser-like mode, so it runs in `math` only.
          exclude: ['src/overlays/**', 'src/purity.test.ts'],
          setupFiles: ['src/test-support/fast-check-setup.ts', 'src/test-support/dom-setup.ts'],
        },
      },
    ],
  },
});
