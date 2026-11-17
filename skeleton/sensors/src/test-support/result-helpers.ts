import type { SensorResult } from '../sensor-result';

/** The value of a success; throws with the failure's details otherwise. Test code only. */
export function expectOk<T>(result: SensorResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result)}`);
  return result.value;
}
