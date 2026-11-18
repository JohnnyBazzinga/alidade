import { captureAltitude, captureBearing, type SightingWindow } from '@alidade/sensors';
import { wrapPi } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepSame } from '../../test-support/deep-same';
import { cappedRuns } from '../../test-support/fast-check-setup';
import {
  closed,
  layoutCase,
  pointInOffsetSpace,
  uniform,
  uniformInteger,
} from '../../test-support/generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { scriptHistory } from '../../test-support/script-history';
import {
  FIXTURE_DECLINATION,
  PARAMETERS,
  liveSession,
  sessionFromHistory,
} from '../../test-support/session-fixtures';
import { pointToRayOffset } from '../image-geometry';
import { captureFrozen } from './capture';
import { sigmaWithMark } from './mark-altitude';
import { step } from './step';

/**
 * Domain (P-10.1): any script (`scriptHistory`, both frames, noisy, including scripts that
 * deliver nothing) run for 0.2 to 6 s; a window length in [50, 3000] ms, a minimum sample count
 * in [1, 40], a staleness limit in [1, 1500] ms (the Session refuses 0, an example of
 * `parameters.test.ts`), and a freeze time from 500 ms before the script's
 * start to 2000 ms after the run's end.
 */
const freezeCase = scriptHistory().chain((h) =>
  fc.record({
    h: fc.constant(h),
    windowLengthMs: closed(50, 3000),
    minSampleCount: uniformInteger(1, 40),
    sampleStalenessMs: closed(1, 1500),
    atFraction: uniform(0, 1),
  }),
);

// P-10.1 (Req 10.1, 8.16): `freeze` fails with insufficient_samples or stale_samples exactly when,
// and with the reason with which, Sensors' captureAltitude on the same window fails. The window
// ends at the Session's time, max(Session time, freeze time) (Req 8.16).
describe('P-10.1 freeze and Sensors share one window rule', () => {
  it('fails with the window reasons exactly when captureAltitude does', () => {
    const tracker = new ErrorTracker();
    const outcomes = new Map<string, number>();
    let steppedBack = 0;
    checkProperty(
      'P-10.1',
      fc.property(freezeCase, (c) => {
        const parameters = {
          ...PARAMETERS,
          windowLengthMs: c.windowLengthMs,
          minSampleCount: c.minSampleCount,
          sampleStalenessMs: c.sampleStalenessMs,
          frameResetRetentionMs: Math.max(
            PARAMETERS.frameResetRetentionMs,
            PARAMETERS.yawReferenceMaxAgeMs + c.windowLengthMs,
          ),
        };
        const start = c.h.run.script.startUtcMs;
        const session = sessionFromHistory('altitude', c.h.built, start, parameters);
        const atUtcMs = start - 500 + c.atFraction * (c.h.built.endUtcMs + 2000 - (start - 500));
        // Req 8.16: the freeze is handled at the Session's time when its own time is earlier.
        const handledUtcMs = Math.max(session.nowUtcMs ?? atUtcMs, atUtcMs);
        if (handledUtcMs > atUtcMs) steppedBack += 1;
        const window: SightingWindow = {
          endUtcMs: handledUtcMs,
          windowLengthMs: c.windowLengthMs,
          minSampleCount: c.minSampleCount,
          sampleStalenessMs: c.sampleStalenessMs,
        };
        const sensors = captureAltitude({
          samples: session.history.samples,
          window,
          calibration: parameters.altitudeCalibration,
        });
        const sensorsWindowReason =
          !sensors.ok &&
          (sensors.reason === 'insufficient_samples' || sensors.reason === 'stale_samples')
            ? sensors.reason
            : null;
        if (session.state !== 'live') {
          // A script that never started: no samples; both must fail with insufficient_samples.
          outcomes.set('not live', (outcomes.get('not live') ?? 0) + 1);
          return (
            sensorsWindowReason === 'insufficient_samples' && session.history.samples.length === 0
          );
        }
        const after = step(session, { kind: 'freeze', timeUtcMs: atUtcMs }, parameters).session;
        const freezeReason =
          after.state === 'frozen'
            ? null
            : after.notice?.reason === 'insufficient_samples' ||
                after.notice?.reason === 'stale_samples'
              ? after.notice.reason
              : null;
        const key = `${freezeReason ?? (after.state === 'frozen' ? 'frozen' : after.notice?.reason)}`;
        outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
        const agrees = freezeReason === sensorsWindowReason;
        tracker.record('disagreements (must be 0)', agrees ? 0 : 1, '0', key);
        return agrees;
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
    for (const key of ['frozen', 'insufficient_samples', 'stale_samples', 'portrait_required']) {
      expect(outcomes.get(key) ?? 0, key).toBeGreaterThan(0);
    }
    console.log(
      `[outcomes] P-10.1 ${JSON.stringify(Object.fromEntries([...outcomes].sort()))}; freeze time earlier than the Session's in ${steppedBack} cases`,
    );
    expect(steppedBack).toBeGreaterThan(0);
  });
});

/**
 * Domain (P-10.9): `ready` scripts with a Screen angle of 0 (both frames, noisy) run for 1.3 to
 * 6 s, a bearing or altitude Session, and the freeze at the newest sample's time.
 */
const readyCase = scriptHistory(false, true, 1300)
  .filter((h) => h.run.script.screenAngleDeg === 0)
  .chain((h) =>
    fc.record({
      h: fc.constant(h),
      kind: fc.constantFrom('bearing' as const, 'altitude' as const),
    }),
  );

// P-10.9 (Req 10.9): for every history that allows a freeze, the Frozen history equals the
// Session's history at the event: same samples, same Frame resets, same Position fix.
describe('P-10.9 the Frozen history is the Session history of the moment', () => {
  it('holds the same samples, resets and fix', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-10.9',
      fc.property(readyCase, ({ h, kind }) => {
        const newest = h.built.samples[h.built.samples.length - 1];
        fc.pre(newest !== undefined);
        const session = sessionFromHistory(kind, h.built, h.run.script.startUtcMs);
        const atUtcMs = newest?.timeUtcMs ?? 0;
        const after = step(session, { kind: 'freeze', timeUtcMs: atUtcMs }, PARAMETERS).session;
        fc.pre(after.state === 'frozen');
        const frozen = after.frozen;
        if (frozen === null) return false;
        const same =
          deepSame(frozen.history.samples, session.history.samples) &&
          deepSame(frozen.history.frameResets, session.history.frameResets) &&
          deepSame(frozen.history.positionFix, session.history.positionFix);
        tracker.record('differences (must be 0)', same ? 0 : 1, '0');
        return same;
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });
});

// P-10.10 (Req 10.10): a Mark's offset equals pointToRayOffset's within 1e-12 rad, and after a
// mark with a point that fails, the Mark equals the Mark before. Domain: `layoutCase` with points
// within ±79° (`pointInOffsetSpace`), a tap sigma in [0, 50] px, and a failing point of one of
// four kinds (outside the Element, NaN, no calibration, a calibration of another aspect ratio),
// on one fixed frozen Session.
describe('P-10.10 the Mark is the offset of the point', () => {
  it('equals pointToRayOffset, and a failing mark keeps the Mark', () => {
    const tracker = new ErrorTracker();
    const { session, endUtcMs } = liveSession('bearing');
    const frozen = step(session, { kind: 'freeze', timeUtcMs: endUtcMs }, PARAMETERS).session;
    expect(frozen.state).toBe('frozen');
    checkProperty(
      'P-10.10',
      fc.property(
        layoutCase().chain((c) => pointInOffsetSpace(c)),
        closed(0, 50),
        uniformInteger(0, 3),
        (c, tapSigmaPx, failKind) => {
          const marked = step(
            frozen,
            {
              kind: 'mark',
              timeUtcMs: endUtcMs,
              point: c.point,
              layout: c.layout,
              calibration: c.calibration,
              tapSigmaPx,
            },
            PARAMETERS,
          ).session;
          const expected = pointToRayOffset(c.layout, c.calibration, c.point);
          const mark = marked.frozen?.mark;
          if (!expected.ok || mark == null) return false;
          const error = Math.max(
            Math.abs(mark.offset.rightRad - expected.value.rightRad),
            Math.abs(mark.offset.upRad - expected.value.upRad),
          );
          tracker.record('Mark offset vs pointToRayOffset [rad]', error, '1e-12');
          const bad =
            failKind === 0
              ? { point: { xPx: -1, yPx: c.point.yPx }, calibration: c.calibration }
              : failKind === 1
                ? { point: { xPx: Number.NaN, yPx: 1 }, calibration: c.calibration }
                : failKind === 2
                  ? { point: c.point, calibration: null }
                  : {
                      point: c.point,
                      calibration: {
                        ...c.calibration,
                        // Twice as wide: the aspect ratio differs by 100 %.
                        imageWidthSourcePx: c.calibration.imageWidthSourcePx * 2,
                      },
                    };
          const after = step(
            marked,
            {
              kind: 'mark',
              timeUtcMs: endUtcMs,
              point: bad.point,
              layout: c.layout,
              calibration: bad.calibration,
              tapSigmaPx,
            },
            PARAMETERS,
          ).session;
          const kept = after.frozen?.mark === mark && after.notice !== null;
          tracker.record('Marks lost on a failing mark (must be 0)', kept ? 0 : 1, '0');
          return error <= 1e-12 && kept;
        },
      ),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });
});

/**
 * Domain (P-12.8, P-12.10): a `ready` script with a Screen angle of 0 (both frames, noisy) run
 * for 1.3 to 6 s, a bearing or altitude Session holding a Declination, a Yaw reference from the
 * compass when the window is Relative (if it can be established), the freeze at the newest
 * sample, and a Mark from `layoutCase` with a point within ±79° and a tap sigma in [0, 50] px.
 * Cases whose freeze fails are discarded.
 */
const markedCase = scriptHistory(false, true, 1300)
  .filter((h) => h.run.script.screenAngleDeg === 0)
  .chain((h) =>
    fc.record({
      h: fc.constant(h),
      kind: fc.constantFrom('bearing' as const, 'altitude' as const),
      point: layoutCase().chain((c) => pointInOffsetSpace(c)),
      tapSigmaPx: closed(0, 50),
    }),
  );

// P-12.8 (Req 12.8) and P-12.10 (Req 12.10): the captured azimuth (or altitude) equals Sensors'
// with the Mark's Ray offset within 1e-12 rad (wrapped), the sigma equals hypot(σ, ε / cos h)
// (or hypot(σ, ε)) within 1e-12, with no Mark the result equals Sensors' deeply; and the sigma with
// a Mark is at least the sigma of the same capture (the same offset) without the Image sigma.
describe('P-12.8 and P-12.10 the capture with a Mark', () => {
  it('equals Sensors with the offset, adds the Image sigma by the formula, and never lowers the sigma', () => {
    const tracker = new ErrorTracker();
    const outcomes = new Map<string, number>();
    let belowAxis = 0;
    checkProperty(
      'P-12.8 / P-12.10',
      fc.property(markedCase, (c) => {
        const newest = c.h.built.samples[c.h.built.samples.length - 1];
        fc.pre(newest !== undefined);
        const atUtcMs = newest?.timeUtcMs ?? 0;
        let session = sessionFromHistory(
          c.kind,
          c.h.built,
          c.h.run.script.startUtcMs,
          PARAMETERS,
          FIXTURE_DECLINATION,
        );
        if (newest?.frame === 'relative') {
          session = step(
            session,
            { kind: 'establishYaw', timeUtcMs: atUtcMs, from: { kind: 'compass' } },
            PARAMETERS,
          ).session;
        }
        const frozenSession = step(
          session,
          { kind: 'freeze', timeUtcMs: atUtcMs },
          PARAMETERS,
        ).session;
        fc.pre(frozenSession.state === 'frozen' && frozenSession.frozen !== null);
        const frozen = frozenSession.frozen;
        if (frozen === null) return false;
        const p = c.point;
        const marked = step(
          frozenSession,
          {
            kind: 'mark',
            timeUtcMs: atUtcMs,
            point: p.point,
            layout: p.layout,
            calibration: p.calibration,
            tapSigmaPx: c.tapSigmaPx,
          },
          PARAMETERS,
        ).session;
        const mark = marked.frozen?.mark;
        if (mark == null) return false;
        const window = frozen.window;
        const history = frozen.history;

        // No Mark: deeply Sensors'.
        const plain = captureFrozen(c.kind, frozen, PARAMETERS);
        const ours = captureFrozen(c.kind, { ...frozen, mark }, PARAMETERS);
        let good = true;
        if (c.kind === 'bearing') {
          const fix = history.positionFix;
          if (fix === null) return false;
          const input = {
            id: `bearing-${frozen.frozenAtUtcMs}`,
            timeUtcMs: frozen.frozenAtUtcMs,
            samples: history.samples,
            frameResets: history.frameResets,
            window,
            ...(frozen.yawReference === null ? {} : { yawReference: frozen.yawReference }),
            yawReferenceMaxAgeMs: PARAMETERS.yawReferenceMaxAgeMs,
            headingSigmaRad: PARAMETERS.headingSigmaRad,
            declination: FIXTURE_DECLINATION,
            positionFix: fix,
            positionStalenessMs: PARAMETERS.positionStalenessMs,
            coarseLocationLimitM: PARAMETERS.coarseLocationLimitM,
          };
          const sensorsPlain = captureBearing(input);
          const sensorsMarked = captureBearing({ ...input, rayOffset: mark.offset });
          good &&= deepSame(
            plain.ok
              ? plain.value.kind === 'bearing'
                ? { ok: true, value: plain.value.bearing }
                : null
              : plain,
            sensorsPlain,
          );
          if (!sensorsMarked.ok) {
            good &&= !ours.ok && ours.reason === sensorsMarked.reason;
            outcomes.set(
              `bearing sensors ${sensorsMarked.reason}`,
              (outcomes.get(`bearing sensors ${sensorsMarked.reason}`) ?? 0) + 1,
            );
            return good;
          }
          const expectedSigma = sigmaWithMark(
            history,
            window,
            mark,
            sensorsMarked.value.azimuthSigmaRad,
            PARAMETERS,
          );
          if (!expectedSigma.ok) {
            good &&= !ours.ok && ours.reason === expectedSigma.reason;
            outcomes.set(
              `bearing mark ${expectedSigma.reason}`,
              (outcomes.get(`bearing mark ${expectedSigma.reason}`) ?? 0) + 1,
            );
            return good;
          }
          if (!ours.ok) {
            outcomes.set(
              `bearing ours ${ours.reason}`,
              (outcomes.get(`bearing ours ${ours.reason}`) ?? 0) + 1,
            );
            return (
              good && ours.reason === 'too_unsteady' && expectedSigma.value > (45 * Math.PI) / 180
            );
          }
          if (ours.value.kind !== 'bearing') return false;
          outcomes.set('bearing ok', (outcomes.get('bearing ok') ?? 0) + 1);
          const d = wrapPi(ours.value.bearing.azimuthRad - sensorsMarked.value.azimuthRad);
          const azimuthError = d.ok ? Math.abs(d.value) : Number.POSITIVE_INFINITY;
          const sigmaError = Math.abs(ours.value.bearing.azimuthSigmaRad - expectedSigma.value);
          tracker.record('bearing azimuth vs Sensors with offset [rad]', azimuthError, '1e-12');
          tracker.record('bearing sigma vs hypot(σ, ε/cos h) [rad]', sigmaError, '1e-12');
          tracker.record(
            'P-12.10 bearing: sigma below the unmarked sigma [rad]',
            Math.max(0, sensorsMarked.value.azimuthSigmaRad - ours.value.bearing.azimuthSigmaRad),
            '0',
          );
          if (
            plain.ok &&
            plain.value.kind === 'bearing' &&
            ours.value.bearing.azimuthSigmaRad < plain.value.bearing.azimuthSigmaRad
          ) {
            belowAxis += 1;
          }
          return (
            good &&
            azimuthError <= 1e-12 &&
            sigmaError <= 1e-12 &&
            ours.value.bearing.azimuthSigmaRad >= sensorsMarked.value.azimuthSigmaRad
          );
        }
        const calibration = PARAMETERS.altitudeCalibration;
        const sensorsPlain = captureAltitude({ samples: history.samples, window, calibration });
        const sensorsMarked = captureAltitude({
          samples: history.samples,
          window,
          calibration,
          rayOffset: mark.offset,
        });
        good &&= deepSame(
          plain.ok
            ? plain.value.kind === 'altitude'
              ? { ok: true, value: plain.value.altitude }
              : null
            : plain,
          sensorsPlain,
        );
        if (!sensorsMarked.ok) {
          outcomes.set(
            `altitude sensors ${sensorsMarked.reason}`,
            (outcomes.get(`altitude sensors ${sensorsMarked.reason}`) ?? 0) + 1,
          );
          return good && !ours.ok && ours.reason === sensorsMarked.reason;
        }
        if (!ours.ok || ours.value.kind !== 'altitude') return false;
        outcomes.set('altitude ok', (outcomes.get('altitude ok') ?? 0) + 1);
        const altitudeError = Math.abs(
          ours.value.altitude.apparentAltitudeRad - sensorsMarked.value.apparentAltitudeRad,
        );
        const sigmaError = Math.abs(
          ours.value.altitude.sigmaRad -
            Math.hypot(sensorsMarked.value.sigmaRad, mark.imageSigmaRad),
        );
        tracker.record('altitude vs Sensors with offset [rad]', altitudeError, '1e-12');
        tracker.record('altitude sigma vs hypot(σ, ε) [rad]', sigmaError, '1e-12');
        tracker.record(
          'P-12.10 altitude: sigma below the unmarked sigma [rad]',
          Math.max(0, sensorsMarked.value.sigmaRad - ours.value.altitude.sigmaRad),
          '0',
        );
        return (
          good &&
          altitudeError <= 1e-12 &&
          sigmaError <= 1e-12 &&
          ours.value.altitude.sigmaRad >= sensorsMarked.value.sigmaRad
        );
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
    expect(outcomes.get('bearing ok') ?? 0).toBeGreaterThan(0);
    expect(outcomes.get('altitude ok') ?? 0).toBeGreaterThan(0);
    console.log(
      `[outcomes] P-12.8 ${JSON.stringify(Object.fromEntries([...outcomes].sort()))}; marked sigma below the Camera-axis capture's in ${belowAxis} cases`,
    );
  });
});
