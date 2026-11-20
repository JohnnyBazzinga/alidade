// The difference `dₖ = measured − computed` of one calibration sight (Req 15.3), shown on the Index
// error screen as each sight is taken.

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationDifferenceRad } from './calibration-difference';
import { indexErrorFromSights } from './index-error';

const params = defaultParameters();
const T = Date.UTC(2026, 11, 21, 14, 40);

describe('calibrationDifferenceRad', () => {
  it('equals the bias of a noise-free sight within 1e-9 rad', () => {
    const [sight] = noiseFreeSights(CATALOGUE_ORIGIN, [T], -3.3 * DEG_TO_RAD, false, params);
    if (sight === undefined) throw new Error('no sight');
    const d = calibrationDifferenceRad(sight, CATALOGUE_ORIGIN, params);
    if (!d.ok) throw new Error(d.reason);
    expect(Math.abs(d.value - -3.3 * DEG_TO_RAD)).toBeLessThan(1e-9);
  });

  it('is the Index error of a single sight', () => {
    const [sight] = noiseFreeSights(CATALOGUE_ORIGIN, [T], 2 * DEG_TO_RAD, false, params);
    if (sight === undefined) throw new Error('no sight');
    const d = calibrationDifferenceRad(sight, CATALOGUE_ORIGIN, params);
    const ie = indexErrorFromSights(
      [sight],
      { position: CATALOGUE_ORIGIN, reportedAccuracyM: 10, sigmaM: 5, timeUtcMs: T },
      false,
      params,
    );
    if (!d.ok || !ie.ok) throw new Error('failed');
    expect(d.value).toBe(ie.value.valueRad);
  });

  it('refuses a time the Sun wrapper cannot use, a place near a pole and numbers that are not finite', () => {
    const [sight] = noiseFreeSights(CATALOGUE_ORIGIN, [T], 0, false, params);
    if (sight === undefined) throw new Error('no sight');
    expect(calibrationDifferenceRad({ ...sight, timeUtcMs: 0 }, CATALOGUE_ORIGIN, params).ok).toBe(
      false,
    );
    expect(calibrationDifferenceRad(sight, { latRad: 1.57, lonRad: 0 }, params).ok).toBe(false);
    expect(
      calibrationDifferenceRad(
        { ...sight, rawApparentAltitudeRad: Number.NaN },
        CATALOGUE_ORIGIN,
        params,
      ).ok,
    ).toBe(false);
  });
});
