import { describe, expect, it } from 'vitest';
import * as sensors from './index';

// Req 1.10: the rules a user interface must apply as the captures do are public, and the
// internal helpers are not.
describe('the public API (Req 1.6, 1.10)', () => {
  it('exports the window, summary, invalidation and reason rules', () => {
    expect(typeof sensors.selectWindow).toBe('function');
    expect(typeof sensors.resetBetween).toBe('function');
    expect(typeof sensors.summariseAzimuths).toBe('function');
    expect(typeof sensors.summariseAltitudes).toBe('function');
    expect(typeof sensors.invalidates).toBe('function');
    expect(typeof sensors.rayOffsetOfDirection).toBe('function');
    expect(sensors.SENSOR_REASONS.length).toBeGreaterThan(0);
  });

  it('does not export the internal helpers', () => {
    for (const name of ['ok', 'err', 'rotationMatrix', 'checkDirection', 'rss', 'ListenerSet']) {
      expect(name in sensors).toBe(false);
    }
  });
});
