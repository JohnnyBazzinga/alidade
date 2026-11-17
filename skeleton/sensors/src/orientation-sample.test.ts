import { describe, expect, it } from 'vitest';
import { orientationSampleFromEvent, type RawOrientationEvent } from './orientation-sample';
import { cameraAxis } from './rotation';
import { rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';

const UPRIGHT: RawOrientationEvent = {
  type: 'deviceorientation',
  alphaDeg: 10,
  betaDeg: 90,
  gammaDeg: -5,
  absolute: false,
  webkitCompassHeadingDeg: null,
  webkitCompassAccuracyDeg: null,
};

describe('orientationSampleFromEvent (§7.3)', () => {
  it('keeps the full rotation in radians and the Clock time (Req 1.4, 1.7, 3.4)', () => {
    const sample = expectOk(orientationSampleFromEvent(UPRIGHT, 1_790_000_000_123, 0));
    expect(sample.timeUtcMs).toBe(1_790_000_000_123);
    expect(Math.abs(sample.rotation.alphaRad - rad(10))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(sample.rotation.betaRad - rad(90))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(sample.rotation.gammaRad - rad(-5))).toBeLessThanOrEqual(1e-15);
  });

  it('refuses a null angle as sensor_unavailable (Req 2.5)', () => {
    // Desktop Chrome sends one event with all angles null when there is no sensor.
    for (const field of ['alphaDeg', 'betaDeg', 'gammaDeg'] as const) {
      expect(orientationSampleFromEvent({ ...UPRIGHT, [field]: null }, 0, 0)).toEqual({
        ok: false,
        reason: 'sensor_unavailable',
        field,
      });
    }
  });

  it('refuses non-finite angles and times, naming them (Req 2.6)', () => {
    expect(orientationSampleFromEvent({ ...UPRIGHT, betaDeg: Number.NaN }, 0, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'betaDeg',
    });
    expect(
      orientationSampleFromEvent({ ...UPRIGHT, gammaDeg: Number.NEGATIVE_INFINITY }, 0, 0),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'gammaDeg',
    });
    expect(orientationSampleFromEvent(UPRIGHT, Number.NaN, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
  });

  it('takes the frame from the event alone (Req 4.3)', () => {
    const frame = (event: RawOrientationEvent) =>
      expectOk(orientationSampleFromEvent(event, 0, 0)).frame;
    expect(frame({ ...UPRIGHT, absolute: true })).toBe('absolute');
    expect(frame({ ...UPRIGHT, absolute: false })).toBe('relative');
    expect(frame({ ...UPRIGHT, type: 'deviceorientationabsolute', absolute: false })).toBe(
      'absolute',
    );
  });

  it('records the heading wrapped, the accuracy with its sign, and the Screen angle (Req 4.5, 4.9)', () => {
    const sample = expectOk(
      orientationSampleFromEvent(
        { ...UPRIGHT, webkitCompassHeadingDeg: -1, webkitCompassAccuracyDeg: -1 },
        0,
        90,
      ),
    );
    expect(Math.abs((sample.magneticHeadingRad ?? Number.NaN) - rad(359))).toBeLessThanOrEqual(
      1e-12,
    );
    expect(sample.compassAccuracyRad).toBeLessThan(0);
    expect(Math.abs((sample.compassAccuracyRad ?? Number.NaN) - rad(-1))).toBeLessThanOrEqual(
      1e-15,
    );
    expect(Math.abs((sample.screenAngleRad ?? Number.NaN) - Math.PI / 2)).toBeLessThanOrEqual(
      1e-15,
    );

    const missing = expectOk(
      orientationSampleFromEvent({ ...UPRIGHT, webkitCompassHeadingDeg: Number.NaN }, 0, null),
    );
    expect(missing.magneticHeadingRad).toBeNull();
    expect(missing.compassAccuracyRad).toBeNull();
    expect(missing.screenAngleRad).toBeNull();
  });

  it('accepts angles outside the W3C ranges', () => {
    expect(orientationSampleFromEvent({ ...UPRIGHT, alphaDeg: 725, betaDeg: -400 }, 0, 0).ok).toBe(
      true,
    );
  });

  it('computes the same Camera axis whatever the Screen angle (Req 4.10)', () => {
    // The device frame is fixed to the device: rotating the screen's content does not move the
    // camera, so the axis depends on the rotation alone.
    const portrait = expectOk(orientationSampleFromEvent(UPRIGHT, 0, 0));
    const landscape = expectOk(orientationSampleFromEvent(UPRIGHT, 0, 90));
    expect(landscape.rotation).toEqual(portrait.rotation);
    expect(cameraAxis(landscape.rotation)).toEqual(cameraAxis(portrait.rotation));
  });
});
