import { wrapPi } from '@alidade/core';
import {
  addOrientationSample,
  captureAltitude,
  captureBearing,
  createSampleHistory,
  MIN_CAPTURE_SIGMA_RAD,
  type Declination,
  type SampleHistory,
  type YawReference,
} from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepSame } from '../../test-support/deep-same';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed, uniform, uniformInteger } from '../../test-support/generators';
import { historyOfAimedAzimuths } from '../../test-support/history-from-script';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { scriptHistory } from '../../test-support/script-history';
import {
  fixtureScript,
  PARAMETERS,
  T0,
  fixtureSession,
  run,
} from '../../test-support/session-fixtures';
import { fromDeg } from '../degrees';
import { liveReadout } from './readout';
import { step } from './step';

const DEG = Math.PI / 180;

/**
 * Domain (P-9.9): a `ready` script run for 1.3 to 6 s (both frames, its own resets), the window of
 * 1000 ms ending at the newest sample; a Yaw reference of the window's frame (always for a
 * Relative window, in one draw of two for an Absolute one) established 0 to 50 000 ms before the
 * window's end, of north reference true or magnetic; a Declination in [-π, π] with a 1-sigma in
 * [0, 0.05]; an altitude calibration offset in [-5°, 5°] with a 1-sigma in [0, 3.5°]. Cases in
 * which Sensors' capture fails (a reset in the window or since the reference, too few samples,
 * an undefined mean) are discarded, as the property compares with a capture that succeeded.
 */
const captureCase = scriptHistory(false, true, 1300).chain((h) =>
  fc.record({
    h: fc.constant(h),
    withYaw: fc.boolean(),
    ageMs: closed(0, 50_000),
    offsetRad: uniform(-Math.PI, Math.PI),
    yawSigmaRad: closed(0.0005, 0.1),
    northReference: fc.constantFrom('true' as const, 'magnetic' as const),
    declinationRad: closed(-Math.PI, Math.PI),
    declinationSigmaRad: closed(0, 0.05),
    calibrationOffsetRad: closed(-5 * DEG, 5 * DEG),
    calibrationSigmaRad: closed(0, 3.5 * DEG),
  }),
);

// P-9.9 (Req 9.9): the Live readout equals Sensors' captureBearing and captureAltitude for the
// same window: azimuth within 1e-9 rad (wrapped), North reference, apparent altitude within
// 1e-12 rad, and, where the capture's sigma exceeds its floor, the readout's Spread equals
// sqrt(sigma² - northSigma²) within 1e-9 (design §8), which checks that the readout feeds
// Sensors' Spread the azimuths the capture does.
describe('P-9.9 the readout equals the capture', () => {
  it("has the capture's azimuth, North reference, altitude and Spread", () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-9.9',
      fc.property(captureCase, (c) => {
        const { history, samples } = c.h.built;
        const newest = samples[samples.length - 1];
        fc.pre(newest !== undefined && samples.length >= 10);
        const endUtcMs = newest?.timeUtcMs ?? 0;
        const frame = newest?.frame ?? 'absolute';
        const fix = history.positionFix;
        fc.pre(fix !== null);
        if (fix === null) return false;
        const useYaw = frame === 'relative' || c.withYaw;
        const yaw: YawReference | null = useYaw
          ? {
              offsetRad: c.offsetRad,
              sigmaRad: c.yawSigmaRad,
              northReference: c.northReference,
              frame,
              establishedUtcMs: endUtcMs - c.ageMs,
            }
          : null;
        const declination: Declination = {
          declinationRad: c.declinationRad,
          sigmaRad: c.declinationSigmaRad,
        };
        const parameters = {
          ...PARAMETERS,
          altitudeCalibration: {
            offsetRad: c.calibrationOffsetRad,
            sigmaRad: c.calibrationSigmaRad,
          },
        };
        const window = {
          endUtcMs,
          windowLengthMs: 1000,
          minSampleCount: 10,
          sampleStalenessMs: 500,
        };
        const bearing = captureBearing({
          id: 'p',
          timeUtcMs: endUtcMs,
          samples: history.samples,
          frameResets: history.frameResets,
          window,
          ...(yaw === null ? {} : { yawReference: yaw }),
          yawReferenceMaxAgeMs: PARAMETERS.yawReferenceMaxAgeMs,
          headingSigmaRad: PARAMETERS.headingSigmaRad,
          declination,
          positionFix: fix,
          positionStalenessMs: PARAMETERS.positionStalenessMs,
          coarseLocationLimitM: PARAMETERS.coarseLocationLimitM,
        });
        const altitude = captureAltitude({
          samples: history.samples,
          window,
          calibration: parameters.altitudeCalibration,
        });
        fc.pre(bearing.ok && altitude.ok);
        if (!bearing.ok || !altitude.ok) return false;

        const readout = liveReadout(history, yaw, declination, parameters, endUtcMs);
        if (readout === null || !readout.azimuth.ok || !readout.apparentAltitudeRad.ok)
          return false;
        const azimuthDiff = wrapPi(readout.azimuth.value.azimuthRad - bearing.value.azimuthRad);
        const azimuthError = azimuthDiff.ok
          ? Math.abs(azimuthDiff.value)
          : Number.POSITIVE_INFINITY;
        const altitudeError = Math.abs(
          readout.apparentAltitudeRad.value - altitude.value.apparentAltitudeRad,
        );
        // The North-reference 1-sigma of the capture (Sensors' table, §7.9): the Declination's
        // 1-sigma enters only when the azimuth before it is magnetic.
        const referenceSigma = yaw === null ? PARAMETERS.headingSigmaRad : yaw.sigmaRad;
        const magnetic = yaw === null || yaw.northReference === 'magnetic';
        const northSigma = magnetic
          ? Math.hypot(referenceSigma, declination.sigmaRad)
          : referenceSigma;
        // Design §8: where the capture's sigma exceeds its floor, the readout's Spread equals
        // sqrt(sigma² - northSigma²) within 1e-9.
        const aboveFloor = bearing.value.azimuthSigmaRad > MIN_CAPTURE_SIGMA_RAD;
        const spreadFromCapture = Math.sqrt(
          Math.max(0, bearing.value.azimuthSigmaRad ** 2 - northSigma ** 2),
        );
        const spreadError = aboveFloor
          ? Math.abs((readout.azimuthSpreadRad ?? Number.NaN) - spreadFromCapture)
          : 0;
        tracker.record('azimuth vs capture [rad]', azimuthError, '1e-9');
        tracker.record('altitude vs capture [rad]', altitudeError, '1e-12');
        tracker.record('Spread vs sqrt(sigma² - northSigma²) [rad]', spreadError, '1e-9');
        // A Declination is held and the capture succeeded, so the North reference is true.
        const problems: string[] = [];
        if (readout.azimuth.value.northReference !== 'true') {
          problems.push(`North reference ${readout.azimuth.value.northReference}`);
        }
        if (azimuthError > 1e-9) problems.push(`azimuth error ${azimuthError}`);
        if (altitudeError > 1e-12) problems.push(`altitude error ${altitudeError}`);
        if (!(spreadError <= 1e-9)) problems.push(`Spread error ${spreadError}`);
        if (problems.length > 0) {
          throw new Error(
            `${problems.join('; ')} (frame ${frame}, yaw ${JSON.stringify(yaw)}, readout ${JSON.stringify(readout.azimuth)}, bearing ${JSON.stringify(bearing.value)})`,
          );
        }
        return true;
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });
});

/**
 * Domain (P-9.10): the samples of a `ready` script run for 1.3 to 6 s (event interval 5 to 100 ms,
 * the first 0 to 500 of them), a Readout interval in [50, 2000] ms.
 */
const publicationCase = scriptHistory(false, true, 1300).chain((h) =>
  fc.record({ h: fc.constant(h), count: uniformInteger(0, 500), intervalMs: closed(50, 2000) }),
);

// P-9.10 (Req 9.10): at most floor(span / interval) + 1 readouts are published, any two published
// `timeUtcMs` differ by at least the interval, and the history equals the one built by adding every
// sample with Sensors' functions.
describe('P-9.10 publication rate', () => {
  it('publishes at most once per interval and keeps every sample', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-9.10',
      fc.property(publicationCase, (c) => {
        const samples = c.h.built.samples.slice(0, c.count);
        const parameters = { ...PARAMETERS, readoutIntervalMs: c.intervalMs };
        const start = c.h.run.script.startUtcMs;
        let { session } = run(
          fixtureSession('altitude'),
          [
            { kind: 'permissionResult', timeUtcMs: start, result: { ok: true, value: 'granted' } },
            {
              kind: 'orientationStarted',
              timeUtcMs: start,
              result: { ok: true, value: 'absolute' },
            },
          ],
          parameters,
        );
        const publications: number[] = [];
        for (const sample of samples) {
          const before = session.lastReadoutUtcMs;
          session = step(
            session,
            { kind: 'sample', timeUtcMs: sample.timeUtcMs, result: { ok: true, value: sample } },
            parameters,
          ).session;
          if (session.lastReadoutUtcMs !== before && session.lastReadoutUtcMs !== null) {
            publications.push(session.lastReadoutUtcMs);
          }
        }
        const first = samples[0];
        const last = samples[samples.length - 1];
        const spanMs =
          first === undefined || last === undefined ? 0 : last.timeUtcMs - first.timeUtcMs;
        const bound = samples.length === 0 ? 0 : Math.floor(spanMs / c.intervalMs) + 1;
        let minGap = Number.POSITIVE_INFINITY;
        for (let i = 1; i < publications.length; i += 1) {
          minGap = Math.min(minGap, (publications[i] ?? 0) - (publications[i - 1] ?? 0));
        }
        const created = createSampleHistory({
          sampleRetentionMs: PARAMETERS.sampleRetentionMs,
          frameResetRetentionMs: PARAMETERS.frameResetRetentionMs,
        });
        let expected: SampleHistory | null = created.ok ? created.value : null;
        for (const sample of samples) {
          const added = expected === null ? null : addOrientationSample(expected, sample);
          if (added !== null && added.ok) expected = added.value;
        }
        tracker.record(
          'publications over the bound (must be 0)',
          Math.max(0, publications.length - bound),
          '0',
        );
        tracker.record(
          'interval shortfall [ms]',
          publications.length < 2 ? 0 : Math.max(0, c.intervalMs - minGap),
          '0',
        );
        return (
          publications.length <= bound &&
          minGap >= c.intervalMs &&
          expected !== null &&
          deepSame(session.history, expected)
        );
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });
});

/**
 * Domain (P-9.11): 1 to 20 azimuths within 30° of a common direction (the common direction in
 * [0, 2π), each offset in [-30°, 30°]), an apparent altitude in [-60°, 60°], a rotation `delta` in
 * [0, 2π). The azimuths are delivered by a noise-free Absolute-frame Simulator aimed at each in
 * turn, one event interval apart.
 */
const rotationCase = fc.record({
  commonRad: uniform(0, 2 * Math.PI),
  offsetsRad: fc.array(closed(-30 * DEG, 30 * DEG), { minLength: 1, maxLength: 20 }),
  altitudeRad: closed(-60 * DEG, 60 * DEG),
  deltaRad: uniform(0, 2 * Math.PI),
});

// P-9.11 (Req 9.11): adding delta to every azimuth adds delta to the readout's azimuth within 1e-9
// rad (wrapped) and leaves the Spread and the Steadiness unchanged within 1e-12.
describe('P-9.11 rotating the azimuths', () => {
  it('adds delta to the azimuth and leaves the Spread and Steadiness alone', () => {
    const tracker = new ErrorTracker();
    const script = fixtureScript({ declinationRad: 0 });
    checkProperty(
      'P-9.11',
      fc.property(rotationCase, (c) => {
        const azimuths = c.offsetsRad.map((o) => c.commonRad + o);
        const rotated = azimuths.map((a) => a + c.deltaRad);
        const a = historyOfAimedAzimuths(script, 1, azimuths, c.altitudeRad);
        const b = historyOfAimedAzimuths(script, 1, rotated, c.altitudeRad);
        const readoutA = liveReadout(a.history, null, null, PARAMETERS, a.endUtcMs);
        const readoutB = liveReadout(b.history, null, null, PARAMETERS, b.endUtcMs);
        if (
          readoutA === null ||
          readoutB === null ||
          !readoutA.azimuth.ok ||
          !readoutB.azimuth.ok
        ) {
          return false;
        }
        const shift = wrapPi(
          readoutB.azimuth.value.azimuthRad - readoutA.azimuth.value.azimuthRad - c.deltaRad,
        );
        const azimuthError = shift.ok ? Math.abs(shift.value) : Number.POSITIVE_INFINITY;
        const spreadError = Math.abs(
          (readoutB.azimuthSpreadRad ?? Number.NaN) - (readoutA.azimuthSpreadRad ?? Number.NaN),
        );
        tracker.record('azimuth shift error [rad]', azimuthError, '1e-9');
        tracker.record('Spread change [rad]', spreadError, '1e-12');
        return (
          azimuthError <= 1e-9 &&
          spreadError <= 1e-12 &&
          readoutA.steadiness === readoutB.steadiness
        );
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
    expect(T0).toBeGreaterThan(0);
    expect(fromDeg(1)).toBeGreaterThan(0);
  });
});
