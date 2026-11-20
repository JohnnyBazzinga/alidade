// The one place that sets the fast-check case count for every property test of this package.
// The Vitest config provides `propertyRuns`: 200 in `pnpm test` (testing.md rule 7), 100 000 in
// `test:deep` (design §11). Properties whose cases are expensive cap themselves with
// `cappedRuns(limit)`. Copied from Sensors' test support, because test support is not exported
// across packages and a shared test package would be a fourth package (design D20).
import fc from 'fast-check';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    propertyRuns: number;
    /** True in the `no-overlays` project, where the Overlays registry is the empty module (D21). */
    overlaysCut: boolean;
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

/**
 * The seed of the whole run from the text of `VIGIA_PROPERTY_SEED`, or `null` when it is not set.
 * Throws for text that is not a 32-bit integer: a slip must not become an unseeded run.
 */
export function seedFrom(text: string | undefined): number | null {
  if (text === undefined) return null;
  if (!/^-?\d+$/.test(text)) throw new Error(`VIGIA_PROPERTY_SEED is not an integer: ${text}`);
  const seed = Number(text);
  if (seed < -2147483648 || seed > 2147483647) {
    throw new Error(`VIGIA_PROPERTY_SEED is not a 32-bit integer: ${text}`);
  }
  return seed;
}

const environment: unknown = Reflect.get(globalThis, 'process');
const seedText: unknown =
  typeof environment === 'object' && environment !== null
    ? Reflect.get(Reflect.get(environment, 'env') as object, 'VIGIA_PROPERTY_SEED')
    : undefined;
const runSeed = seedFrom(typeof seedText === 'string' ? seedText : undefined);

fc.configureGlobal({ numRuns: propertyRuns(), ...(runSeed === null ? {} : { seed: runSeed }) });
if (runSeed !== null && isDeepRun()) console.log(`[deep] seed of this run: ${runSeed}`);
