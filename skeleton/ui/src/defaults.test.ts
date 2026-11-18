import { describe, expect, it } from 'vitest';
import * as defaults from './defaults';
import { fromDeg } from './math/degrees';

const DEFAULTS_SOURCE = import.meta.glob<string>('./defaults.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('named constants (Req 19.1)', () => {
  it('has the stated values', () => {
    expect(defaults.READOUT_INTERVAL_MS).toBe(200);
    expect(Math.abs(defaults.STEADY_BELOW_RAD - fromDeg(0.5))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(defaults.UNSTEADY_ABOVE_RAD - fromDeg(2))).toBeLessThanOrEqual(1e-15);
    expect(defaults.ELLIPSE_VERTEX_COUNT).toBe(72);
    expect(Math.abs(defaults.WEDGE_ARC_STEP_RAD - fromDeg(1))).toBeLessThanOrEqual(1e-15);
    expect(defaults.MIN_TOUCH_TARGET_PX).toBe(48);
    expect(defaults.PRIMARY_CONTROL_HEIGHT_PX).toBe(64);
    expect(defaults.SPACING_PX).toBe(8);
    expect(defaults.MIN_CONTRAST_RATIO).toBe(7);
    expect(defaults.MIN_READOUT_FONT_PX).toBe(20);
    expect(defaults.MAP_ERROR_REPORT_INTERVAL_MS).toBe(1000);
    expect(defaults.SIMULATOR_TICK_MS).toBe(100);
    expect(defaults.SCREEN_ANGLE_TOLERANCE_RAD).toBe(1e-9);
    expect(Math.abs(defaults.MAX_MARK_ALTITUDE_RAD - fromDeg(80))).toBeLessThanOrEqual(1e-15);
  });

  it('documents where the Steadiness thresholds come from (Req 19.5)', () => {
    const source = Object.values(DEFAULTS_SOURCE)[0] ?? '';
    const steady = source.slice(0, source.indexOf('export const STEADY_BELOW_RAD'));
    const unsteady = source.slice(0, source.indexOf('export const UNSTEADY_ABOVE_RAD'));
    for (const comment of [steady, unsteady]) {
      expect(comment).toMatch(/probe/);
      expect(comment).toMatch(/two phones/);
      expect(comment).toMatch(/confirmed by the device checks/);
    }
  });
});
