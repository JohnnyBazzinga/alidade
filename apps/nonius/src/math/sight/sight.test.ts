import { describe, expect, it } from 'vitest';
import { altitudeCapture, sightOf } from '../../test-support/captures';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse, type IndexError } from './index-error';
import { sightFromCapture } from './sight';

const D = DEG_TO_RAD;
const params = defaultParameters();
const NONE = calibrationInUse(null);
const FROZEN_AT = Date.UTC(2026, 11, 21, 14, 40, 1);

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

const INDEX_ERROR: IndexError = {
  valueRad: -3.3 * D,
  sigmaRad: 0.2 * D,
  sightCount: 3,
  measuredUtcMs: FROZEN_AT - 3_600_000,
  simulated: false,
};

describe('sightFromCapture (Req 4.5)', () => {
  it('takes the time as the middle of the Frozen window', () => {
    const c = altitudeCapture({
      apparentAltitudeRad: 30 * D,
      frozenAtUtcMs: FROZEN_AT,
      windowLengthMs: 1000,
    });
    const sight = value(sightFromCapture(c, null, [], NONE, false, params));
    expect(sight.timeUtcMs).toBe(FROZEN_AT - 500);
  });

  it('keeps the capture\u2019s altitude, standard deviation and Mark term, and the Sun side and flag as given', () => {
    const side = { azimuthRad: 2, northReference: 'magnetic' as const };
    const c = altitudeCapture({
      apparentAltitudeRad: 0.123456789,
      sampleStdDevRad: 0.0042,
      markSigmaRad: 0.0017,
      frozenAtUtcMs: FROZEN_AT,
    });
    const sight = value(sightFromCapture(c, side, [], NONE, true, params));
    expect(sight.rawApparentAltitudeRad).toBe(0.123456789);
    expect(sight.sampleStdDevRad).toBe(0.0042);
    expect(sight.markSigmaRad).toBe(0.0017);
    expect(sight.sunSide).toEqual(side);
    expect(sight.simulated).toBe(true);
  });

  it('takes the Mark term as 0 without a Mark', () => {
    const c = altitudeCapture({ apparentAltitudeRad: 30 * D, markSigmaRad: null });
    expect(value(sightFromCapture(c, null, [], NONE, false, params)).markSigmaRad).toBe(0);
  });

  it('names the id from the freeze time, and makes it unique with -2, -3', () => {
    const c = altitudeCapture({ apparentAltitudeRad: 30 * D, frozenAtUtcMs: FROZEN_AT });
    const first = value(sightFromCapture(c, null, [], NONE, false, params));
    expect(first.id).toBe(`sight-${FROZEN_AT}`);
    const second = value(sightFromCapture(c, null, [first.id], NONE, false, params));
    expect(second.id).toBe(`sight-${FROZEN_AT}-2`);
    const third = value(sightFromCapture(c, null, [first.id, second.id], NONE, false, params));
    expect(third.id).toBe(`sight-${FROZEN_AT}-3`);
    // A gap in the numbering is filled: the first free suffix.
    const filled = value(sightFromCapture(c, null, [first.id, third.id], NONE, false, params));
    expect(filled.id).toBe(`sight-${FROZEN_AT}-2`);
  });
});

describe('the refusals of Req 4.8, on the corrected altitude', () => {
  const at = (altitudeRad: number, calibration = NONE) =>
    sightFromCapture(
      altitudeCapture({ apparentAltitudeRad: altitudeRad, frozenAtUtcMs: FROZEN_AT }),
      null,
      [],
      calibration,
      false,
      params,
    );

  it('accepts 5° and 80° exactly and refuses either side with sun_too_low and sun_too_high', () => {
    expect(at(params.minSightAltitudeRad).ok).toBe(true);
    expect(at(params.maxSightAltitudeRad).ok).toBe(true);
    expect(at(params.minSightAltitudeRad - 1e-9)).toMatchObject({
      ok: false,
      reason: 'sun_too_low',
    });
    expect(at(params.maxSightAltitudeRad + 1e-9)).toMatchObject({
      ok: false,
      reason: 'sun_too_high',
    });
  });

  it('judges the altitude after the Index error: 8° raw with an Index error of +4° is 4°, too low', () => {
    const cal = calibrationInUse({ ...INDEX_ERROR, valueRad: 4 * D });
    expect(at(8 * D, cal)).toMatchObject({ ok: false, reason: 'sun_too_low' });
    expect(at(8 * D, calibrationInUse({ ...INDEX_ERROR, valueRad: -4 * D })).ok).toBe(true);
    // Raw 78° with an Index error of −4° is 82°, too high.
    expect(at(78 * D, calibrationInUse({ ...INDEX_ERROR, valueRad: -4 * D }))).toMatchObject({
      ok: false,
      reason: 'sun_too_high',
    });
  });

  it('refuses a time outside the Sun wrapper\u2019s range with sight_time_unsupported', () => {
    const early = altitudeCapture({ apparentAltitudeRad: 30 * D, frozenAtUtcMs: 0 });
    expect(sightFromCapture(early, null, [], NONE, false, params)).toMatchObject({
      ok: false,
      reason: 'sight_time_unsupported',
    });
    // The middle of the window, not its end, is the time: 400 ms before the range starts.
    const edge = altitudeCapture({
      apparentAltitudeRad: 30 * D,
      frozenAtUtcMs: params.sunModelStartUtcMs + 400,
      windowLengthMs: 1000,
    });
    expect(sightFromCapture(edge, null, [], NONE, false, params)).toMatchObject({
      reason: 'sight_time_unsupported',
    });
    const inside = altitudeCapture({
      apparentAltitudeRad: 30 * D,
      frozenAtUtcMs: params.sunModelStartUtcMs + 500,
      windowLengthMs: 1000,
    });
    expect(sightFromCapture(inside, null, [], NONE, false, params).ok).toBe(true);
  });

  it('refuses a full set with sights_full, at the limit', () => {
    const c = altitudeCapture({ apparentAltitudeRad: 30 * D, frozenAtUtcMs: FROZEN_AT });
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `other-${i}`);
    expect(sightFromCapture(c, null, ids(params.maxSights - 1), NONE, false, params).ok).toBe(true);
    expect(sightFromCapture(c, null, ids(params.maxSights), NONE, false, params)).toMatchObject({
      ok: false,
      reason: 'sights_full',
    });
  });

  it('refuses a bearing capture, a non-finite altitude and bad parameters', () => {
    const bearing = {
      ...altitudeCapture({ apparentAltitudeRad: 30 * D }),
      kind: 'bearing',
    } as never;
    expect(sightFromCapture(bearing, null, [], NONE, false, params)).toMatchObject({
      ok: false,
      reason: 'invalid_observation',
    });
    const nan = altitudeCapture({ apparentAltitudeRad: Number.NaN });
    expect(sightFromCapture(nan, null, [], NONE, false, params)).toMatchObject({
      ok: false,
      reason: 'invalid_observation',
    });
    expect(
      sightFromCapture(altitudeCapture({ apparentAltitudeRad: 0.5 }), null, [], NONE, false, {
        ...params,
        maxSights: 1,
      }),
    ).toMatchObject({ ok: false, reason: 'invalid_number', field: 'maxSights' });
  });

  it('is built from a Sight whose fields the tests can rely on', () => {
    expect(sightOf().id).toBe('sight-1');
  });
});
