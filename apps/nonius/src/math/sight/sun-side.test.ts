import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { wrapPiN, wrapTwoPiN } from '../../test-support/angles';
import { frozenSunSighting } from '../../test-support/frozen-sun-sighting';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { sunSideFromFrozen } from './sun-side';

const D = DEG_TO_RAD;
const params = defaultParameters();
const START = 1_790_000_000_000; // 2026-09-21, inside the WMM's years
const SUN = { azimuthRad: 150 * D, apparentAltitudeRad: 35 * D };

describe('sunSideFromFrozen (Req 4.6, 6.5)', () => {
  it('an Absolute frame gives the magnetic azimuth: the scripted true azimuth less the Declination', () => {
    const f = frozenSunSighting({
      truth: CATALOGUE_ORIGIN,
      startUtcMs: START,
      frame: 'absolute',
      ...SUN,
    });
    const side = sunSideFromFrozen(f.frozen, params);
    expect(side).not.toBeNull();
    expect(side?.northReference).toBe('magnetic');
    // The Declination is not zero at 30° N, 40° W, so a missing correction would show.
    expect(Math.abs(f.declination.declinationRad)).toBeGreaterThan(2 * D);
    const expected = wrapTwoPiN(SUN.azimuthRad - f.declination.declinationRad);
    expect(Math.abs(wrapPiN((side?.azimuthRad ?? 0) - expected))).toBeLessThan(1e-6);
  });

  it('a Relative frame with a Yaw reference from a known true azimuth gives that reference', () => {
    const f = frozenSunSighting({
      truth: CATALOGUE_ORIGIN,
      startUtcMs: START,
      frame: 'relative',
      zeroRad: 1,
      knownAzimuth: true,
      ...SUN,
    });
    expect(f.frozen.yawReference).not.toBeNull();
    const side = sunSideFromFrozen(f.frozen, params);
    expect(side?.northReference).toBe('true');
    expect(Math.abs(wrapPiN((side?.azimuthRad ?? 0) - SUN.azimuthRad))).toBeLessThan(1e-6);
  });

  it('a Relative frame without a Yaw reference gives none', () => {
    const f = frozenSunSighting({
      truth: CATALOGUE_ORIGIN,
      startUtcMs: START,
      frame: 'relative',
      zeroRad: 1,
      ...SUN,
    });
    expect(f.frozen.yawReference).toBeNull();
    expect(sunSideFromFrozen(f.frozen, params)).toBeNull();
  });

  it("uses a Mark's Ray offset: a ray 0.02 rad to the right turns the azimuth clockwise by about 0.02 / cos h", () => {
    const f = frozenSunSighting({
      truth: CATALOGUE_ORIGIN,
      startUtcMs: START,
      frame: 'absolute',
      ...SUN,
    });
    const plain = sunSideFromFrozen(f.frozen, params);
    const marked = sunSideFromFrozen(
      {
        ...f.frozen,
        mark: {
          offset: { rightRad: 0.02, upRad: 0 },
          imageSigmaRad: 0.001,
          calibration: {
            fovRad: 1,
            fovAxis: 'diagonal',
            fovSigmaRad: 0.01,
            imageWidthSourcePx: 720,
            imageHeightSourcePx: 1280,
          },
        },
      },
      params,
    );
    const shift = wrapPiN((marked?.azimuthRad ?? 0) - (plain?.azimuthRad ?? 0));
    expect(shift).toBeGreaterThan(0);
    expect(Math.abs(shift - 0.02 / Math.cos(SUN.apparentAltitudeRad))).toBeLessThan(1.5e-3);
  });

  it('gives none when the window holds too few samples', () => {
    const f = frozenSunSighting({
      truth: CATALOGUE_ORIGIN,
      startUtcMs: START,
      frame: 'absolute',
      ...SUN,
    });
    const empty = { ...f.frozen, history: { ...f.frozen.history, samples: [] } };
    expect(sunSideFromFrozen(empty, params)).toBeNull();
  });

  it('gives none for bad parameters, and for a window that is not finite', () => {
    const f = frozenSunSighting({
      truth: CATALOGUE_ORIGIN,
      startUtcMs: START,
      frame: 'absolute',
      ...SUN,
    });
    expect(sunSideFromFrozen(f.frozen, { ...params, aimSigmaRad: Number.NaN })).toBeNull();
    expect(
      sunSideFromFrozen(
        { ...f.frozen, window: { ...f.frozen.window, endUtcMs: Number.NaN } },
        params,
      ),
    ).toBeNull();
  });
});
