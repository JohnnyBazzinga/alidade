import { defineConfig } from 'vitest/config';
import { PERFORMANCE_TESTS } from './vitest.config';

// The timing test of Req 7.10, run alone and without file parallelism, so that it does not
// compete for the CPU with the rest of the suite (design §9). Run with `pnpm test:perf`.
export default defineConfig({
  test: {
    include: PERFORMANCE_TESTS,
    fileParallelism: false,
    setupFiles: ['src/test-support/fast-check-setup.ts'],
  },
});
