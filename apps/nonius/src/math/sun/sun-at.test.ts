import { describe, expect, it } from 'vitest';
import { wrapPiN } from '../../test-support/angles';
import { sunFixture } from '../../test-support/sun-fixture';
import { ARCMIN_TO_RAD, DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { refractionRad } from './refraction';
import { sunAt } from './sun-at';

const params = defaultParameters();
const D = DEG_TO_RAD;
const fixture = sunFixture();

describe('sunAt against the Naval Observatory (Req 3.5)', () => {
  for (const row of fixture.celnav) {
    it(`${row.id}: geometric altitude within 1.5′ of Hc and azimuth within 0.1° of Zn`, () => {
      const r = sunAt(
        { latRad: row.latitudeDeg * D, lonRad: row.longitudeDeg * D },
        row.timeUtcMs,
        params,
      );
      if (!r.ok) throw new Error(`failed: ${r.reason}`);
      const altErr = Math.abs(r.value.geometricAltitudeRad - row.hcDeg * D);
      const azErr = Math.abs(wrapPiN(r.value.trueAzimuthRad - row.znDeg * D));
      expect(altErr / ARCMIN_TO_RAD, 'altitude, arc-minutes').toBeLessThanOrEqual(1.5);
      expect(azErr / D, 'azimuth, degrees').toBeLessThanOrEqual(0.1);
    });
  }
});

describe('sunAt', () => {
  const place = { latRad: 30 * D, lonRad: -40 * D };
  const t = fixture.celnav[0]?.timeUtcMs ?? 0;

  it('makes the apparent altitude from the geometric one by the inverse of the refraction', () => {
    const r = sunAt(place, t, params);
    if (!r.ok) throw new Error(r.reason);
    const refr = refractionRad(r.value.apparentAltitudeRad);
    if (!refr.ok) throw new Error(refr.reason);
    expect(
      Math.abs(r.value.apparentAltitudeRad - refr.value - r.value.geometricAltitudeRad),
    ).toBeLessThan(1e-12);
    expect(r.value.trueAzimuthRad).toBeGreaterThanOrEqual(0);
    expect(r.value.trueAzimuthRad).toBeLessThan(2 * Math.PI);
  });

  it('has the Sun in the south at noon in January at 30° N (azimuth near 180°, east of south before)', () => {
    const r = sunAt(place, t, params); // 12:00 UT1 at 40° W: before local noon (14:40 UT)
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.trueAzimuthRad / D).toBeGreaterThan(120);
    expect(r.value.trueAzimuthRad / D).toBeLessThan(180);
  });

  it('refuses a position within 1° of a pole, a time out of range, and bad parameters', () => {
    expect(sunAt({ latRad: 89.5 * D, lonRad: 0 }, t, params)).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(sunAt(place, 0, params)).toMatchObject({ ok: false, reason: 'sight_time_unsupported' });
    expect(sunAt({ latRad: Number.NaN, lonRad: 0 }, t, params)).toMatchObject({ ok: false });
    expect(sunAt(place, t, { ...params, aimSigmaRad: -1 })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'aimSigmaRad',
    });
  });

  it('refuses a Sun too far below the horizon for the refraction (no apparent altitude)', () => {
    // 30° N, 40° W at 00:00 UT: local night, the Sun about 40° below the horizon.
    const night = Date.UTC(2026, 0, 15, 0, 0);
    expect(sunAt(place, night, params)).toMatchObject({ ok: false, reason: 'invalid_number' });
  });
});
