import { describe, expect, it } from 'vitest';
import { sunSensors, SUN_SCRIPT } from './sun-sensors';

describe('sunSensors', () => {
  it('makes a source on the Sun script and counts a position request', async () => {
    const s = sunSensors();
    expect(() => s.controls()).toThrow();
    const made = s.createSource();
    if (!made.ok) throw new Error(made.reason);
    expect(s.controls()).toBeDefined();
    expect(SUN_SCRIPT.startUtcMs).toBeGreaterThan(0);
    void made.value.startPosition();
    expect(s.calls.positionCalls).toBe(1);
    expect(s.calls.permissionCalls).toBe(0);
    made.value.stop();
  });
});
