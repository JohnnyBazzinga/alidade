import {
  addFrameReset,
  captureBearing,
  type FrameResetCause,
  type OrientationFrame,
  type SampleHistory,
  type YawReference,
} from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { propertyRuns, cappedRuns } from '../../test-support/fast-check-setup';
import { closed, uniform, uniformInteger } from '../../test-support/generators';
import { scriptHistory } from '../../test-support/script-history';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { FIXTURE_DECLINATION } from '../../test-support/session-fixtures';
import { yawStatus } from './yaw-status';

const T = 1_790_000_000_000;
const CAUSES: readonly FrameResetCause[] = [
  'hidden',
  'blur',
  'pagehide',
  'restart',
  'frame_change',
];

// P-11.8 (Req 11.8): the age of a Yaw reference equals now - established when that is not
// negative, and 0 otherwise; never negative, never NaN. Domain: reference times and `now` uniform
// within ±1e7 ms of a time in 2026 (ends and equal times drawn), maximum ages in [1000, 150 000]
// ms, 0 to 3 resets of any cause in the same range.
describe('P-11.8 yawStatus age', () => {
  it('equals max(0, now - established), never negative or NaN', () => {
    const tracker = new ErrorTracker();
    const time = closed(T - 1e7, T + 1e7);
    checkProperty(
      'P-11.8',
      fc.property(
        fc.record({
          establishedUtcMs: time,
          nowUtcMs: fc.oneof(
            time,
            time.map((x) => x),
          ),
          sameTime: fc.boolean(),
          maxAgeMs: closed(1000, 150_000),
          frame: fc.constantFrom<OrientationFrame>('absolute', 'relative'),
          resets: fc.array(fc.record({ timeUtcMs: time, cause: fc.constantFrom(...CAUSES) }), {
            maxLength: 3,
          }),
        }),
        (c) => {
          const nowUtcMs = c.sameTime ? c.establishedUtcMs : c.nowUtcMs;
          const y: YawReference = {
            offsetRad: 0.1,
            sigmaRad: 0.01,
            northReference: 'magnetic',
            frame: c.frame,
            establishedUtcMs: c.establishedUtcMs,
          };
          const status = yawStatus(y, c.resets, nowUtcMs, c.maxAgeMs);
          const expected = Math.max(0, nowUtcMs - c.establishedUtcMs);
          tracker.record('age error [ms]', Math.abs(status.ageMs - expected), '0 (exact)');
          return Number.isFinite(status.ageMs) && status.ageMs >= 0 && status.ageMs === expected;
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

/**
 * Domain (P-11.7): a `ready` script (see `simulatorScript`; both frames, 0 to 3 resets of its
 * own) run for 1.3 to 6 s, so that the window ending at the newest sample holds at least ten
 * fresh samples at every event interval of at most 100 ms; a Yaw reference of the script's frame
 * established no later than the window's start, `gapMs` in [0, 149 000] ms before it (so an age
 * of 1000 to 150 000 ms), with a maximum age in [1000, 150 000] ms; 0 to 3 further Frame resets of
 * every cause (including `frame_change` in the Absolute frame, which a script cannot produce) at
 * times from 5000 ms before the reference to 2000 ms after the window's end. Excludes a reference
 * established inside the window (it has an example test).
 */
const yawCase = scriptHistory(false, true, 1300).chain((h) =>
  fc.record({
    h: fc.constant(h),
    gapMs: closed(0, 149_000),
    maxAgeMs: closed(1000, 150_000),
    offsetRad: uniform(-Math.PI, Math.PI),
    northReference: fc.constantFrom('true' as const, 'magnetic' as const),
    extraTimes: fc.array(uniform(0, 1), { maxLength: 3 }),
    extraCauses: fc.array(fc.constantFrom(...CAUSES), { minLength: 3, maxLength: 3 }),
    pickExtra: uniformInteger(0, 3),
  }),
);

// P-11.7 (Req 11.7): the Yaw status and Sensors' captureBearing on the same window agree:
// `valid` iff the capture fails with neither frame_reset nor stale_yaw_reference; `invalidated`
// iff it fails with frame_reset; `stale` only if it fails with stale_yaw_reference.
describe('P-11.7 yawStatus against captureBearing', () => {
  it('agrees with Sensors on the window of the newest sample', () => {
    const tracker = new ErrorTracker();
    const outcomes = new Map<string, number>();
    checkProperty(
      'P-11.7',
      fc.property(yawCase, (c) => {
        const { history, samples } = c.h.built;
        const newest = samples[samples.length - 1];
        const frame = newest?.frame;
        fc.pre(newest !== undefined && frame !== undefined && samples.length >= 10);
        const endUtcMs = newest?.timeUtcMs ?? 0;
        const window = {
          endUtcMs,
          windowLengthMs: 1000,
          minSampleCount: 10,
          sampleStalenessMs: 500,
        };
        const startUtcMs = endUtcMs - 1000;
        const establishedUtcMs = startUtcMs - c.gapMs;
        const y: YawReference = {
          offsetRad: c.offsetRad,
          sigmaRad: 0.03,
          northReference: c.northReference,
          frame: frame ?? 'absolute',
          establishedUtcMs,
        };
        let withExtras: SampleHistory = history;
        const span = endUtcMs + 2000 - (establishedUtcMs - 5000);
        for (let i = 0; i < c.pickExtra; i += 1) {
          const timeUtcMs = establishedUtcMs - 5000 + (c.extraTimes[i] ?? 0) * span;
          const added = addFrameReset(withExtras, {
            timeUtcMs,
            cause: c.extraCauses[i] ?? 'hidden',
          });
          if (added.ok) withExtras = added.value;
        }
        const status = yawStatus(y, withExtras.frameResets, endUtcMs, c.maxAgeMs);
        const fix = withExtras.positionFix;
        fc.pre(fix !== null);
        if (fix === null) return false;
        const capture = captureBearing({
          id: 'p',
          timeUtcMs: endUtcMs,
          samples: withExtras.samples,
          frameResets: withExtras.frameResets,
          window,
          yawReference: y,
          yawReferenceMaxAgeMs: c.maxAgeMs,
          headingSigmaRad: 0.035,
          declination: FIXTURE_DECLINATION,
          positionFix: fix,
          positionStalenessMs: 30_000,
          coarseLocationLimitM: 100,
        });
        const reason = capture.ok ? 'ok' : capture.reason;
        const key = `${y.frame}:${status.status}:${reason}`;
        outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
        const failsReset = reason === 'frame_reset';
        const failsStale = reason === 'stale_yaw_reference';
        const agrees =
          (status.status === 'valid') === (!failsReset && !failsStale) &&
          (status.status === 'invalidated') === failsReset &&
          (!failsStale || status.status === 'stale');
        tracker.record('disagreements (must be 0)', agrees ? 0 : 1, '0', key);
        return agrees;
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
    const statuses = new Set([...outcomes.keys()].map((k) => k.split(':')[1]));
    expect(statuses).toEqual(new Set(['valid', 'stale', 'invalidated']));
    expect(new Set([...outcomes.keys()].map((k) => k.split(':')[0]))).toEqual(
      new Set(['absolute', 'relative']),
    );
    console.log(`[outcomes] P-11.7 ${JSON.stringify(Object.fromEntries([...outcomes].sort()))}`);
  });
});
