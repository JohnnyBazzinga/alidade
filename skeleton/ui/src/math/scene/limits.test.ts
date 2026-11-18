import { MAX_RAY_OFFSET_RAD, offAxisRay, rayOffsetOfDirection } from '@alidade/sensors';
import { imageLayout } from '../image-layout';
import { displayedFocalPx, offsetOfPixel, rayOffsetToPoint } from '../image-geometry';
import { rotationOfPose } from '../../test-support/pose-rotation';
import { CATALOGUE_CALIBRATION } from './catalogue';
import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import { step } from '../session/step';
import { PARAMETERS, T0, fixtureScript, liveSession } from '../../test-support/session-fixtures';

// The standing rule for limits, P-16.8: Sensors' compass refuses a camera steeper than 30°. A pose
// aimed at exactly 30° goes through degrees and the rotation and lands on one side of the limit
// or the other by rounding; P-16.8 aims Relative cases at least 1e-6 rad inside it. This test
// records what happens at the exact limit, and 1e-6 rad inside it.
describe('the compass at exactly 30° (P-16.8)', () => {
  function yawAt(altitudeRad: number) {
    const script = fixtureScript({
      frame: { kind: 'relative', zeroRad: 2, resets: [] },
      heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
      pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: altitudeRad, rollRad: 0 }],
    });
    const { session, endUtcMs } = liveSession('bearing', script);
    return step(
      session,
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
  }

  it('refuses the compass at exactly 30° (the rounding lands beyond it) and accepts it 1e-6 rad inside', () => {
    const at = yawAt(fromDeg(30));
    const inside = yawAt(fromDeg(30) - 1e-6);
    expect(inside.yawReference).not.toBeNull();
    expect(at.yawReference).toBeNull();
    expect(at.notice?.reason).toBe('compass_unreliable');
  });
});

// The standing rule for limits, P-16.7: a Target at an offset of exactly 80°, projected and taken
// back through the unchecked geometry of Req 5.2, may land beyond Sensors' 80° and be refused by
// `offAxisRay`. P-16.7 skips Targets within 1e-6 rad of 80° (none were drawn in 10 000 cases);
// this test records the exact limit.

describe('a Target at exactly 80° of offset (P-16.7)', () => {
  it('round-trips within one ulp of the limit; the record of which side it lands on', () => {
    const rotation = rotationOfPose({ azimuthRad: 1, apparentAltitudeRad: 0.2, rollRad: 0.1 });
    const exact = { rightRad: MAX_RAY_OFFSET_RAD, upRad: 0 };
    const direction = offAxisRay(rotation, exact);
    if (!direction.ok) throw new Error(direction.reason);
    const back = rayOffsetOfDirection(rotation, direction.value);
    const layout = imageLayout(
      { widthSourcePx: 720, heightSourcePx: 1280 },
      { widthPx: 390, heightPx: 844 },
      'cover',
    );
    if (!layout.ok) throw new Error('layout');
    const focal = displayedFocalPx(layout.value, CATALOGUE_CALIBRATION);
    if (!focal.ok) throw new Error('focal');
    // Sensors' own inverse may itself put it an ulp beyond the limit and call it not visible.
    if (!back.ok) throw new Error(back.reason);
    if (back.value === null) {
      expect(back.value).toBeNull();
      return;
    }
    const point = rayOffsetToPoint(layout.value, CATALOGUE_CALIBRATION, back.value);
    if (!point.ok) throw new Error(point.reason);
    const unchecked = offsetOfPixel(layout.value, focal.value, point.value.point);
    const overshoot = Math.abs(unchecked.rightRad) - MAX_RAY_OFFSET_RAD;
    expect(Math.abs(overshoot)).toBeLessThanOrEqual(1e-15);
    expect(offAxisRay(rotation, unchecked).ok).toBe(overshoot <= 0);
  });
});
