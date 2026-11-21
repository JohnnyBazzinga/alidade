import {
  captureAltitude,
  captureBearing,
  MIN_CAPTURE_SIGMA_RAD,
  type BearingCaptureInput,
} from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed, layoutCase, pointInOffsetSpace, uniform } from '../../test-support/generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { buildHistoryFromRun, type ScriptRun } from '../../test-support/history-from-script';
import { scriptHistory, scriptRun } from '../../test-support/script-history';
import {
  FIXTURE_DECLINATION,
  PARAMETERS,
  sessionFromHistory,
} from '../../test-support/session-fixtures';
import { captureFrozen } from './capture';
import type { SessionEvent, YawSource } from './session-events';
import { step } from './step';

/**
 * Domain (P-12.6): the domain of P-12.8 (a `ready` script with a Screen angle of 0, both frames,
 * noisy, run for 1.3 to 6 s; a bearing or altitude Session holding a Declination; the freeze at
 * the newest sample; a Mark from `layoutCase` within ±79° with a tap sigma in [0, 50] px), and in
 * addition: the way north is set, one of none (it then holds only on the Absolute frame), the
 * compass, a known true azimuth, a known magnetic azimuth (azimuth in [0, 2π), 1-sigma in
 * [0.01°, 5°]); and the Mark present or not. Cases whose freeze fails are discarded.
 *
 * Two branches, drawn first (`oneof`, weights 2 and 1), so that the outcome kinds the reach check
 * demands are reached by construction and not by chance:
 * - `free`: the whole domain above, as before. The compass succeeds there in about 1 case in 100
 *   (a Relative frame, a heading, no reset in the window, the camera within 30° of the horizon
 *   for the whole window), which at 200 cases left the kind unreached about one run in eight.
 * - `compass`: a bearing Session whose way of setting north is the compass, on a script that the
 *   compass accepts: the drawn script with its frame made Relative and its resets removed, a
 *   heading present with an accepted accuracy, and every drawn altitude (keyframes and aims)
 *   clamped to ±20° (the limit is 30°, and the noise and bias are at most 1° and 5°). Everything
 *   else (seed, times, noise, bias, Declination, fix, Mark, tap sigma) is as drawn. The branch
 *   adds cases to the domain; it removes none.
 */
const DEG = Math.PI / 180;
const COMPASS_ALTITUDE_CLAMP_RAD = 20 * DEG;
const clampAltitude = (x: number): number =>
  Math.max(-COMPASS_ALTITUDE_CLAMP_RAD, Math.min(COMPASS_ALTITUDE_CLAMP_RAD, x));

/** The drawn run, made one the compass accepts (see the domain above). */
function compassAccepted(run: ScriptRun): ScriptRun {
  const script = run.script;
  const zeroRad = script.frame.kind === 'relative' ? script.frame.zeroRad : 0;
  return {
    ...run,
    script: {
      ...script,
      frame: { kind: 'relative', zeroRad, resets: [] },
      heading: {
        biasRad: script.heading?.biasRad ?? 0,
        noiseSigmaRad: script.heading?.noiseSigmaRad ?? 0,
        jumps: script.heading?.jumps ?? [],
        reportedAccuracyDeg: 10,
      },
      pose: script.pose.map((k) => ({
        ...k,
        apparentAltitudeRad: clampAltitude(k.apparentAltitudeRad),
      })),
    },
    steps: run.steps.map((st) => ({
      ...st,
      aim:
        st.aim === null
          ? null
          : { ...st.aim, apparentAltitudeRad: clampAltitude(st.aim.apparentAltitudeRad) },
    })),
  };
}

const freeHistory = scriptHistory(false, true, 1300).filter(
  (h) => h.run.script.screenAngleDeg === 0,
);
const compassHistory = scriptRun(false, true, 1300)
  .filter((run) => run.script.screenAngleDeg === 0)
  .map(compassAccepted)
  .map((run) => ({ run, built: buildHistoryFromRun(run) }));

const markFields = {
  point: layoutCase().chain((c) => pointInOffsetSpace(c)),
  tapSigmaPx: closed(0, 50),
  withMark: fc.boolean(),
};

const detailsCase = fc.oneof(
  {
    weight: 2,
    arbitrary: freeHistory.chain((h) =>
      fc.record({
        h: fc.constant(h),
        kind: fc.constantFrom('bearing' as const, 'altitude' as const),
        ...markFields,
        // Weighted towards the compass, which succeeds only on a Relative frame with a heading and
        // a level camera; every way of setting north stays in the domain.
        yaw: fc.oneof(
          { weight: 1, arbitrary: fc.constant(null) },
          { weight: 3, arbitrary: fc.constant<YawSource>({ kind: 'compass' }) },
          {
            weight: 2,
            arbitrary: fc.record({
              kind: fc.constant('knownAzimuth' as const),
              azimuthRad: uniform(0, 2 * Math.PI),
              sigmaRad: closed((0.01 * Math.PI) / 180, (5 * Math.PI) / 180),
              northReference: fc.constantFrom('true' as const, 'magnetic' as const),
            }),
          },
        ),
      }),
    ),
  },
  {
    weight: 1,
    arbitrary: compassHistory.chain((h) =>
      fc.record({
        h: fc.constant(h),
        kind: fc.constant('bearing' as const),
        ...markFields,
        yaw: fc.constant<YawSource>({ kind: 'compass' }),
      }),
    ),
  },
);

// P-12.6 (Req 12.6, 13.5), a design property: what a captured result carries is the number Sensors
// used, to the last bit. For a bearing, Sensors' sigma (with the Mark's Ray offset when there is
// one) is exactly `max(floor, hypot(Spread, north))` with the carried Spread, the carried north
// sigma and the carried Declination, which is held exactly when Sensors used one; the sigma with a
// Mark is exactly `hypot(Sensors' sigma, markSigmaRad)`. For an altitude, the carried standard
// deviation is Sensors' `sampleStdDevRad` and `markSigmaRad` is the Image angular sigma. Where the
// sigma is at its floor the Spread cannot be read back; those cases are counted.
describe('P-12.6 the captured result carries the numbers Sensors used', () => {
  it('holds the Spread, the north sigma, the Declination and the lens term exactly', () => {
    const tracker = new ErrorTracker();
    const outcomes = new Map<string, number>();
    const count = (k: string) => outcomes.set(k, (outcomes.get(k) ?? 0) + 1);
    checkProperty(
      'P-12.6',
      fc.property(detailsCase, (c) => {
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
        const events: SessionEvent[] = [];
        if (c.yaw !== null) events.push({ kind: 'establishYaw', timeUtcMs: atUtcMs, from: c.yaw });
        events.push({ kind: 'freeze', timeUtcMs: atUtcMs });
        if (c.withMark) {
          events.push({
            kind: 'mark',
            timeUtcMs: atUtcMs,
            point: c.point.point,
            layout: c.point.layout,
            calibration: c.point.calibration,
            tapSigmaPx: c.tapSigmaPx,
          });
        }
        for (const e of events) session = step(session, e, PARAMETERS).session;
        const frozen = session.frozen;
        fc.pre(session.state === 'frozen' && frozen !== null);
        if (frozen === null) return false;
        fc.pre(!c.withMark || frozen.mark !== null);
        const mark = frozen.mark;
        const ours = captureFrozen(c.kind, frozen, PARAMETERS);
        if (!ours.ok) {
          count(`${c.kind} refused`);
          return true;
        }
        const r = ours.value;
        let errors = 0;
        if (r.kind === 'bearing') {
          const fix = frozen.history.positionFix;
          if (fix === null) return false;
          const input: BearingCaptureInput = {
            id: 'x',
            timeUtcMs: frozen.frozenAtUtcMs,
            samples: frozen.history.samples,
            frameResets: frozen.history.frameResets,
            window: frozen.window,
            ...(mark === null ? {} : { rayOffset: mark.offset }),
            ...(frozen.yawReference === null ? {} : { yawReference: frozen.yawReference }),
            yawReferenceMaxAgeMs: PARAMETERS.yawReferenceMaxAgeMs,
            headingSigmaRad: PARAMETERS.headingSigmaRad,
            ...(frozen.declination === null ? {} : { declination: frozen.declination }),
            positionFix: fix,
            positionStalenessMs: PARAMETERS.positionStalenessMs,
            coarseLocationLimitM: PARAMETERS.coarseLocationLimitM,
          };
          const sensors = captureBearing(input);
          if (!sensors.ok) return false;
          const y = frozen.yawReference;
          const expectedSource =
            y === null
              ? 'phone-compass'
              : frozen.yawReferenceSource === 'compass'
                ? 'compass'
                : 'known-azimuth';
          const expectedNorthSigma = y === null ? PARAMETERS.headingSigmaRad : y.sigmaRad;
          const usesDeclination = y === null || y.northReference === 'magnetic';
          if (r.north?.source !== expectedSource) errors += 1;
          if (!Object.is(r.north?.sigmaRad, expectedNorthSigma)) errors += 1;
          if ((r.declination !== null) !== usesDeclination) errors += 1;
          const north =
            r.declination === null
              ? expectedNorthSigma
              : Math.hypot(expectedNorthSigma, r.declination.sigmaRad);
          const rebuilt = Math.max(MIN_CAPTURE_SIGMA_RAD, Math.hypot(r.azimuthSpreadRad, north));
          if (rebuilt === MIN_CAPTURE_SIGMA_RAD) count('bearing at the sigma floor');
          if (!Object.is(rebuilt, sensors.value.azimuthSigmaRad)) errors += 1;
          if (mark === null) {
            if (r.markSigmaRad !== null) errors += 1;
          } else if (
            r.markSigmaRad === null ||
            !Object.is(
              Math.hypot(sensors.value.azimuthSigmaRad, r.markSigmaRad),
              r.bearing.azimuthSigmaRad,
            )
          ) {
            errors += 1;
          }
          count(`bearing ${expectedSource}${mark === null ? '' : ' marked'}`);
        } else {
          const sensors = captureAltitude({
            samples: frozen.history.samples,
            window: frozen.window,
            calibration: PARAMETERS.altitudeCalibration,
            ...(mark === null ? {} : { rayOffset: mark.offset }),
          });
          if (!sensors.ok) return false;
          if (!Object.is(r.altitudeStdDevRad, sensors.value.sampleStdDevRad)) errors += 1;
          if (r.north !== null || r.declination !== null) errors += 1;
          if (!Object.is(r.markSigmaRad, mark === null ? null : mark.imageSigmaRad)) errors += 1;
          count(`altitude${mark === null ? '' : ' marked'}`);
        }
        tracker.record('carried numbers that differ from Sensors\u2019 (must be 0)', errors, '0');
        return errors === 0;
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
    const seen = (prefix: string) =>
      [...outcomes].filter(([k]) => k.startsWith(prefix)).reduce((n, [, v]) => n + v, 0);
    for (const k of [
      'bearing phone-compass',
      'bearing compass',
      'bearing known-azimuth',
      'altitude',
      'altitude marked',
    ]) {
      expect(seen(k)).toBeGreaterThan(0);
    }
    expect(seen('bearing') - seen('bearing refused')).toBeGreaterThan(0);
    console.log(`[outcomes] P-12.6 ${JSON.stringify(Object.fromEntries([...outcomes].sort()))}`);
  });
});
