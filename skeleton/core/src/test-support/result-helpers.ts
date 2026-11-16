import type { Result } from '../result';

/** Returns the value of a successful Result; fails the test with the reason otherwise. */
export function unwrapOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected a success but got failure "${result.reason}"`);
  }
  return result.value;
}
