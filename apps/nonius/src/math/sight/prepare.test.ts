import { UNCALIBRATED_ALTITUDE } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { sightOf } from '../../test-support/captures';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { refractionRad } from '../sun/refraction';
import { subsolarPoint } from '../sun/sun-wrapper';
import { calibrationInUse, type IndexError } from './index-error';
import { prepareSights } from './prepare';

const D = DEG_TO_RAD;
const params = defaultParameters();
const T = Date.UTC(2026, 11, 21, 14, 40);

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

const IE: IndexError = {
  valueRad: -3.3 * D,
  sigmaRad: 0.2 * D,
  sightCount: 3,
  measuredUtcMs: T,
  simulated: false,
};

describe('prepareSights (D5, Req 4.4, 4.5, 4.8)', () => {
  it('without an Index error uses the raw altitude and the skeleton\u2019s uncalibrated sigma as the Common sigma', () => {
    const { prepared } = value(
      prepareSights(
        [sightOf({ rawApparentAltitudeRad: 30 * D, timeUtcMs: T })],
        calibrationInUse(null),
        params,
      ),
    );
    const p = prepared[0];
    expect(p?.correctedApparentAltitudeRad).toBe(30 * D);
    expect(p?.commonSigmaRad).toBe(UNCALIBRATED_ALTITUDE.sigmaRad);
  });

  it('with an Index error subtracts it exactly and takes its sigma as the Common sigma', () => {
    const raw = 30 * D;
    const { prepared } = value(
      prepareSights(
        [sightOf({ rawApparentAltitudeRad: raw, timeUtcMs: T })],
        calibrationInUse(IE),
        params,
      ),
    );
    expect(prepared[0]?.correctedApparentAltitudeRad).toBe(raw - IE.valueRad);
    expect(prepared[0]?.commonSigmaRad).toBe(IE.sigmaRad);
  });

  it('takes the observed geometric altitude as the corrected one less its refraction', () => {
    const { prepared } = value(
      prepareSights(
        [sightOf({ rawApparentAltitudeRad: 10 * D, timeUtcMs: T })],
        calibrationInUse(null),
        params,
      ),
    );
    const r = value(refractionRad(10 * D));
    expect(prepared[0]?.observedGeometricAltitudeRad).toBe(10 * D - r);
  });

  it('makes the Independent sigma hypot(sample sd, Mark term, aim, 0.1 R at the corrected altitude)', () => {
    const sight = sightOf({
      rawApparentAltitudeRad: 12 * D,
      sampleStdDevRad: 0.004,
      markSigmaRad: 0.003,
      timeUtcMs: T,
    });
    const { prepared } = value(prepareSights([sight], calibrationInUse(null), params));
    const r = value(refractionRad(12 * D));
    const expected = Math.hypot(
      0.004,
      0.003,
      params.aimSigmaRad,
      params.refractionSigmaFraction * r,
    );
    expect(Math.abs((prepared[0]?.independentSigmaRad ?? 0) - expected)).toBeLessThan(1e-15);
  });

  it('takes the Subsolar point and the Sun\u2019s declination from the wrapper at the Sight\u2019s time', () => {
    const { prepared } = value(
      prepareSights(
        [sightOf({ timeUtcMs: T, rawApparentAltitudeRad: 30 * D })],
        calibrationInUse(null),
        params,
      ),
    );
    const expected = value(subsolarPoint(T, params));
    expect(prepared[0]?.subsolar).toEqual(expected);
    expect(prepared[0]?.sunDeclinationRad).toBe(expected.latRad);
  });

  it('sets aside a Sight whose corrected altitude is out of the limits, with its cause, and keeps the order', () => {
    const low = sightOf({ id: 'low', rawApparentAltitudeRad: 4 * D, timeUtcMs: T });
    const mid = sightOf({ id: 'mid', rawApparentAltitudeRad: 30 * D, timeUtcMs: T });
    const high = sightOf({ id: 'high', rawApparentAltitudeRad: 81 * D, timeUtcMs: T });
    const r = value(prepareSights([low, mid, high], calibrationInUse(null), params));
    expect(r.prepared.map((p) => p.sight.id)).toEqual(['mid']);
    expect(r.setAside.map((s) => [s.sight.id, s.cause])).toEqual([
      ['low', 'sun_too_low'],
      ['high', 'sun_too_high'],
    ]);
  });

  it('applies the limits after the Index error: removing it can set a Sight aside, and no Sight is deleted', () => {
    const sight = sightOf({ rawApparentAltitudeRad: 8 * D, timeUtcMs: T });
    const withIe = value(
      prepareSights([sight], calibrationInUse({ ...IE, valueRad: 4 * D }), params),
    );
    expect(withIe.prepared).toHaveLength(0);
    expect(withIe.setAside[0]?.cause).toBe('sun_too_low');
    const without = value(prepareSights([sight], calibrationInUse(null), params));
    expect(without.prepared).toHaveLength(1);
  });

  it('keeps a Sight exactly at 5° and at 80°', () => {
    const a = sightOf({
      id: 'a',
      rawApparentAltitudeRad: params.minSightAltitudeRad,
      timeUtcMs: T,
    });
    const b = sightOf({
      id: 'b',
      rawApparentAltitudeRad: params.maxSightAltitudeRad,
      timeUtcMs: T,
    });
    expect(value(prepareSights([a, b], calibrationInUse(null), params)).prepared).toHaveLength(2);
  });

  it('fails with sight_time_unsupported, naming the Sight, for a time the wrapper refuses', () => {
    const bad = sightOf({ id: 'old', rawApparentAltitudeRad: 30 * D, timeUtcMs: 0 });
    expect(prepareSights([bad], calibrationInUse(null), params)).toMatchObject({
      ok: false,
      reason: 'sight_time_unsupported',
      id: 'old',
    });
  });

  it('gives nothing for no Sights, and fails first on bad parameters', () => {
    expect(value(prepareSights([], calibrationInUse(null), params))).toEqual({
      prepared: [],
      setAside: [],
    });
    expect(
      prepareSights([], calibrationInUse(null), { ...params, aimSigmaRad: Number.NaN }),
    ).toMatchObject({ ok: false, reason: 'invalid_number', field: 'aimSigmaRad' });
  });
});
