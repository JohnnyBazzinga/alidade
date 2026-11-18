// The one place that sets the fast-check case count for every property test of this package.
// The Vitest config provides `propertyRuns`: 200 in `pnpm test` (testing.md rule 7), 100 000 in
// `test:deep` (design §8). Properties whose cases are expensive cap themselves with
// `cappedRuns(limit)`. Copied from Sensors' test support, because test support is not exported
// across packages and a shared test package would be a fourth package (design D20).
import fc from 'fast-check';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    propertyRuns: number;
  }
}

/** testing.md rule 7. */
export const MIN_PROPERTY_RUNS = 200;

/** The case count of this run: the provided value, never below 200. */
export function propertyRuns(): number {
  const provided = inject('propertyRuns');
  return Math.max(MIN_PROPERTY_RUNS, provided);
}

/**
 * `min(propertyRuns(), limit)`, never below 200: for the properties whose cases are expensive
 * (design §8 lists each limit). `limit` is the property's cap in `test:deep`.
 */
export function cappedRuns(limit: number): number {
  return Math.max(MIN_PROPERTY_RUNS, Math.min(propertyRuns(), limit));
}

/** True in the checkpoint run, where properties print their worst errors. */
export function isDeepRun(): boolean {
  return propertyRuns() > MIN_PROPERTY_RUNS;
}

fc.configureGlobal({ numRuns: propertyRuns() });
