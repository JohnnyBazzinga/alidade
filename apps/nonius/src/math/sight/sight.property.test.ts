import { UNCALIBRATED_ALTITUDE } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { altitudeCapture } from '../../test-support/captures';
import { propertyRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { refractionRad } from '../sun/refraction';
import { calibrationInUse, type IndexError } from './index-error';
import { prepareSights } from './prepare';
import { sightFromCapture } from './sight';

const D = DEG_TO_RAD;
const params = defaultParameters();

describe('P-4.12: a Sight from a capture, its corrected altitude and its sigmas (Req 4.12)', () => {
  // Generator: apparent altitude in [5°, 80°]; sample standard deviation in [0, 5°]; a Mark term
  // in [0, 1°] or none; a time inside the Sun wrapper's range (2026 to 2029); a Calibration in
  // use that is either none or an Index error in [-10°, 10°] with sigma in [0, 5°]. Excluded: a
  // corrected altitude outside [5°, 80°], which is set aside by `prepareSights` and counted as a
  // discard of the part about the prepared Sight.
  const captureArb = fc.record({
    altitudeRad: fc.double({ min: 5 * D, max: 80 * D, noNaN: true }),
    sdRad: fc.double({ min: 0, max: 5 * D, noNaN: true }),
    mark: fc.oneof(fc.constant(null), fc.double({ min: 0, max: 1 * D, noNaN: true })),
    timeUtcMs: fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2030, 0, 1) - 1 }),
    indexError: fc.oneof(
      fc.constant(null),
      fc.record({
        valueRad: fc.double({ min: -10 * D, max: 10 * D, noNaN: true }),
        sigmaRad: fc.double({ min: 0, max: 5 * D, noNaN: true }),
      }),
    ),
  });

  it('keeps the altitude exactly; the corrected altitude is raw minus the Index error exactly; the sigmas follow the formulas', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.12',
      fc.property(captureArb, (c) => {
        const capture = altitudeCapture({
          apparentAltitudeRad: c.altitudeRad,
          sampleStdDevRad: c.sdRad,
          markSigmaRad: c.mark,
          frozenAtUtcMs: c.timeUtcMs + 500,
        });
        const sightResult = sightFromCapture(
          capture,
          null,
          [],
          calibrationInUse(null),
          false,
          params,
        );
        if (!sightResult.ok) throw new Error(`sight refused: ${sightResult.reason}`);
        const sight = sightResult.value;
        expect(sight.rawApparentAltitudeRad).toBe(c.altitudeRad);
        expect(sight.sampleStdDevRad).toBe(c.sdRad);
        expect(sight.markSigmaRad).toBe(c.mark ?? 0);
        expect(sight.timeUtcMs).toBe(c.timeUtcMs);

        const indexError: IndexError | null =
          c.indexError === null
            ? null
            : {
                ...c.indexError,
                sightCount: 3,
                measuredUtcMs: c.timeUtcMs,
                simulated: false,
              };
        const calibration = calibrationInUse(indexError);
        const prepared = prepareSights([sight], calibration, params);
        if (!prepared.ok) throw new Error(`prepare failed: ${prepared.reason}`);
        const correctedRad = c.altitudeRad - (indexError?.valueRad ?? 0);
        fc.pre(prepared.value.prepared.length === 1);
        const p = prepared.value.prepared[0];
        if (p === undefined) throw new Error('no prepared sight');
        expect(p.correctedApparentAltitudeRad).toBe(correctedRad);
        const r = refractionRad(correctedRad);
        if (!r.ok) throw new Error('refraction failed');
        const expectedSigma = Math.hypot(
          c.sdRad,
          c.mark ?? 0,
          params.aimSigmaRad,
          params.refractionSigmaFraction * r.value,
        );
        const sigmaError = Math.abs(p.independentSigmaRad - expectedSigma);
        tracker.record('independent sigma, rad', sigmaError, '1e-12', `alt = ${c.altitudeRad}`);
        expect(sigmaError).toBeLessThanOrEqual(1e-12);
        expect(p.commonSigmaRad).toBe(indexError?.sigmaRad ?? UNCALIBRATED_ALTITUDE.sigmaRad);
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });

  it('has an example for the case the generator discards: a corrected altitude out of the limits', () => {
    const capture = altitudeCapture({ apparentAltitudeRad: 6 * D });
    const sight = sightFromCapture(capture, null, [], calibrationInUse(null), false, params);
    if (!sight.ok) throw new Error('refused');
    const ie: IndexError = {
      valueRad: 3 * D,
      sigmaRad: 0,
      sightCount: 1,
      measuredUtcMs: 0,
      simulated: false,
    };
    const prepared = prepareSights([sight.value], calibrationInUse(ie), params);
    expect(prepared).toMatchObject({ ok: true });
    if (prepared.ok) {
      expect(prepared.value.prepared).toHaveLength(0);
      expect(prepared.value.setAside[0]?.cause).toBe('sun_too_low');
    }
  });
});
