// The one place that sets the fast-check default for every property test in this package.
// testing.md rule 7: at least 200 cases per property.
import fc from 'fast-check';

export const MIN_PROPERTY_RUNS = 200;

fc.configureGlobal({ numRuns: MIN_PROPERTY_RUNS });
