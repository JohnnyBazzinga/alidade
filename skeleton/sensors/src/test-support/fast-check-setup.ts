// The one place that sets the fast-check case count for every property test of this package.
// The Vitest config provides `propertyRuns`: 200 in `pnpm test` (testing.md rule 7), 100 000 in
// `test:deep` (design §8). Properties whose cases are expensive cap themselves with
// `cappedRuns()`.
import fc from 'fast-check';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    propertyRuns: number;
  }
}

/** testing.md rule 7. */
export const MIN_PROPERTY_RUNS = 200;
/** The cap of the properties listed at 10 000 cases in design §8. */
export const CAPPED_PROPERTY_RUNS = 10_000;

/** The case count of this run: the provided value, never below 200. */
export function propertyRuns(): number {
  const provided = inject('propertyRuns');
  return Math.max(MIN_PROPERTY_RUNS, provided);
}

/** `min(propertyRuns(), 10 000)`: for the properties that run a whole simulation or history. */
export function cappedRuns(): number {
  return Math.min(propertyRuns(), CAPPED_PROPERTY_RUNS);
}

/** True in the checkpoint run, where properties print their worst errors. */
export function isDeepRun(): boolean {
  return propertyRuns() > MIN_PROPERTY_RUNS;
}

fc.configureGlobal({ numRuns: propertyRuns() });
