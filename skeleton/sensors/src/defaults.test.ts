import { degToRad } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import * as defaults from './defaults';

function rad(degrees: number): number {
  const converted = degToRad(degrees);
  if (!converted.ok) throw new Error('bad test angle');
  return converted.value;
}

describe('default parameters (Req 10.1)', () => {
  it('has the stated values', () => {
    expect(defaults.SIGHTING_WINDOW_LENGTH_MS).toBe(1000);
    expect(defaults.MIN_SAMPLE_COUNT).toBe(10);
    expect(defaults.SAMPLE_STALENESS_MS).toBe(500);
    expect(defaults.POSITION_STALENESS_MS).toBe(30_000);
    expect(defaults.COARSE_LOCATION_LIMIT_M).toBe(100);
    expect(defaults.LISTENING_TIMEOUT_MS).toBe(3000);
    expect(defaults.POSITION_TIMEOUT_MS).toBe(30_000);
    expect(defaults.YAW_REFERENCE_MAX_AGE_MS).toBe(60_000);
    expect(Math.abs(defaults.HEADING_SIGMA_RAD - rad(2))).toBeLessThanOrEqual(1e-15);
    expect(defaults.POSITION_CONFIDENCE_SCALE).toBe(1);
    expect(defaults.SAMPLE_RETENTION_MS).toBe(5000);
    expect(defaults.FRAME_RESET_RETENTION_MS).toBe(120_000);
    expect(defaults.UNCALIBRATED_ALTITUDE.offsetRad).toBe(0);
    expect(Math.abs(defaults.UNCALIBRATED_ALTITUDE.sigmaRad - rad(3.5))).toBeLessThanOrEqual(1e-15);
  });

  it('keeps every Frame reset that can invalidate a usable Yaw reference (Req 14.3)', () => {
    expect(defaults.FRAME_RESET_RETENTION_MS).toBeGreaterThanOrEqual(
      defaults.YAW_REFERENCE_MAX_AGE_MS + defaults.SIGHTING_WINDOW_LENGTH_MS,
    );
  });

  it('cannot be changed at run time', () => {
    expect(Object.isFrozen(defaults.UNCALIBRATED_ALTITUDE)).toBe(true);
  });
});
