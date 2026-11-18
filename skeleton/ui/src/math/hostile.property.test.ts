import type { OrientationSample } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkSessionParameters,
  defaultSessionParameters,
  type SessionParameters,
} from './session/parameters';
import { UI_REASONS } from '../reasons';
import { cappedRuns } from '../test-support/fast-check-setup';
import {
  allFinite,
  hostileCalibration,
  hostileNullable,
  hostileNumber,
  hostilePixelPoint,
  hostilePixelSize,
  hostileRayOffset,
  hostileSourceSize,
  isTotalResult,
} from '../test-support/hostile';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { PARAMETERS, sessionInState } from '../test-support/session-fixtures';
import { checkCalibration, focalLengthSourcePx } from './camera-calibration';
import { contrastRatio, relativeLuminance } from './contrast';
import { formatAzimuthDeg, formatSignedDeg, parseDegrees } from './display-format';
import { pointToRayOffset, rayOffsetToPoint } from './image-geometry';
import { imageLayout, type ImageLayout } from './image-layout';
import { messageFor } from './messages';
import { imageAngularSigmaRad } from './ray-uncertainty';
import type { SessionStateKind } from './session/session';
import type { SessionEvent } from './session/session-events';
import { createSession, step } from './session/step';
import { yawStatus } from './session/yaw-status';

const RUNS = 10_000;

/** A layout record with hostile numbers in every field, or a real layout of hostile sizes. */
const hostileLayout: fc.Arbitrary<ImageLayout> = fc.oneof(
  fc.record({
    fit: fc.constantFrom('cover' as const, 'contain' as const),
    sourceWidthSourcePx: hostileNumber(),
    sourceHeightSourcePx: hostileNumber(),
    elementWidthPx: hostileNumber(),
    elementHeightPx: hostileNumber(),
    scalePxPerSourcePx: hostileNumber(),
    displayedWidthPx: hostileNumber(),
    displayedHeightPx: hostileNumber(),
    leftPx: hostileNumber(),
    topPx: hostileNumber(),
  }),
  fc
    .tuple(
      hostileSourceSize(),
      hostilePixelSize(),
      fc.constantFrom('cover' as const, 'contain' as const),
    )
    .map(([s, e, fit]) => {
      const l = imageLayout(s, e, fit);
      return l.ok
        ? l.value
        : {
            fit,
            sourceWidthSourcePx: 1,
            sourceHeightSourcePx: 1,
            elementWidthPx: 1,
            elementHeightPx: 1,
            scalePxPerSourcePx: 1,
            displayedWidthPx: 1,
            displayedHeightPx: 1,
            leftPx: 0,
            topPx: 0,
          };
    }),
);

const hostileCalibrationOrNull = fc.oneof(fc.constant(null), hostileCalibration());

/** Every number of a returned string is a number: no `NaN`, `Infinity` or `undefined` in text. */
function cleanText(text: string): boolean {
  return typeof text === 'string' && !/NaN|Infinity|undefined/.test(text);
}

// P-2.6 (Req 2.1, 2.6): every public function of the Math layer of tasks 2 to 12, given hostile
// type-correct input (NaN, ±Infinity, -0, subnormals, ±MAX_VALUE, the doubles either side of
// every limit, negative sizes, null where nullable), returns without throwing, and every number
// reachable in its result is finite. `fromDeg` and `toDeg` are internal and pass NaN on by
// design (§2); every public function that uses them is held here.
describe('P-2.6 the Math layer is total', () => {
  it('geometry, calibration, uncertainty, display, contrast and messages', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.6 functions',
      fc.property(
        fc.record({
          layout: hostileLayout,
          calibration: hostileCalibrationOrNull,
          point: hostilePixelPoint(),
          offset: hostileRayOffset(),
          tap: hostileNumber(),
          source: hostileSourceSize(),
          element: hostilePixelSize(),
          angle: hostileNumber(),
          decimals: hostileNumber(),
          text: fc.oneof(fc.string(), hostileNumber().map(String)),
          colourA: fc.record({ r: hostileNumber(), g: hostileNumber(), b: hostileNumber() }),
          colourB: fc.record({ r: hostileNumber(), g: hostileNumber(), b: hostileNumber() }),
          reason: fc.constantFrom(...UI_REASONS),
          accuracy: hostileNumber(),
          yawTimes: fc.tuple(hostileNumber(), hostileNumber(), hostileNumber()),
        }),
        (c) => {
          const results: unknown[] = [];
          const calibration = c.calibration;
          if (calibration !== null) {
            results.push(checkCalibration(calibration), focalLengthSourcePx(calibration));
          }
          results.push(
            imageLayout(c.source, c.element, 'cover'),
            imageLayout(c.source, c.element, 'contain'),
            pointToRayOffset(c.layout, calibration, c.point),
            rayOffsetToPoint(c.layout, calibration, c.offset),
            imageAngularSigmaRad(c.layout, calibration, c.point, c.tap),
            parseDegrees(c.text),
            contrastRatio(c.colourA, c.colourB),
            relativeLuminance(c.colourA),
          );
          const totals = results.every(isTotalResult);
          const texts = [
            formatAzimuthDeg(c.angle, c.decimals),
            formatSignedDeg(c.angle, c.decimals),
          ];
          const message = messageFor({
            ok: false,
            reason: c.reason,
            reportedAccuracyM: c.accuracy,
          });
          const y = {
            offsetRad: c.yawTimes[0],
            sigmaRad: 0.01,
            northReference: 'magnetic' as const,
            frame: 'relative' as const,
            establishedUtcMs: c.yawTimes[1],
          };
          const status = yawStatus(
            y,
            [{ timeUtcMs: c.yawTimes[0], cause: 'hidden' }],
            c.yawTimes[2],
            c.yawTimes[0],
          );
          const good =
            totals &&
            texts.every(cleanText) &&
            cleanText(message.whatHappened) &&
            cleanText(message.whatToDo) &&
            allFinite(status);
          tracker.record('non-total results (must be 0)', good ? 0 : 1, '0');
          return good;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });

  it('checkSessionParameters and createSession', () => {
    const tracker = new ErrorTracker();
    const keys = Object.keys(defaultSessionParameters()).filter((k) => k !== 'altitudeCalibration');
    checkProperty(
      'P-2.6 parameters',
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...keys), hostileNumber()), { maxLength: 6 }),
        hostileNumber(),
        hostileNumber(),
        (patches, offsetRad, sigmaRad) => {
          const p = {
            ...defaultSessionParameters(),
            ...Object.fromEntries(patches),
            altitudeCalibration: { offsetRad, sigmaRad },
          } as SessionParameters;
          const checked = checkSessionParameters(p);
          const bearing = createSession('bearing', p);
          const good =
            (checked.ok ? true : isTotalResult(checked)) &&
            (bearing.ok ? allFinite(bearing.value) : isTotalResult(bearing));
          tracker.record('non-total results (must be 0)', good ? 0 : 1, '0');
          return good;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    expect(checkSessionParameters(PARAMETERS).ok).toBe(true);
  });
});

const STATES: readonly SessionStateKind[] = [
  'permission',
  'starting',
  'live',
  'frozen',
  'captured',
  'failed',
];

/** One hostile event of any kind, built on a real sample so that it is type-correct. */
function hostileEvent(sample: OrientationSample): fc.Arbitrary<SessionEvent> {
  const n = hostileNumber();
  const time = fc.oneof(n, fc.constant(1_790_000_001_500));
  return fc.oneof(
    fc.record({ kind: fc.constant('tick' as const), timeUtcMs: n }),
    fc.record({
      kind: fc.constant('sample' as const),
      timeUtcMs: time,
      result: fc.record({
        ok: fc.constant(true as const),
        value: fc.record({
          timeUtcMs: n,
          frame: fc.constantFrom('absolute' as const, 'relative' as const),
          rotation: fc.record({ alphaRad: n, betaRad: n, gammaRad: n }),
          screenAngleRad: hostileNullable(),
          magneticHeadingRad: hostileNullable(),
          compassAccuracyRad: hostileNullable(),
        }),
      }),
    }),
    fc.record({
      kind: fc.constant('sample' as const),
      timeUtcMs: time,
      result: n.map((t) => ({ ok: true as const, value: { ...sample, timeUtcMs: t } })),
    }),
    fc.record({
      kind: fc.constant('frameReset' as const),
      timeUtcMs: time,
      event: fc.record({
        timeUtcMs: n,
        cause: fc.constantFrom('hidden' as const, 'frame_change' as const),
      }),
    }),
    fc.record({
      kind: fc.constant('positionFix' as const),
      timeUtcMs: time,
      result: fc.record({
        ok: fc.constant(true as const),
        value: fc.record({
          position: fc.record({ latRad: n, lonRad: n }),
          reportedAccuracyM: n,
          sigmaM: n,
          timeUtcMs: n,
        }),
      }),
    }),
    fc.record({
      kind: fc.constant('positionFix' as const),
      timeUtcMs: time,
      result: fc.record({
        ok: fc.constant(false as const),
        reason: fc.constant('coarse_location' as const),
        reportedAccuracyM: n,
      }),
    }),
    fc.record({
      kind: fc.constant('declination' as const),
      timeUtcMs: time,
      result: fc.record({
        ok: fc.constant(true as const),
        value: fc.record({ declinationRad: n, sigmaRad: n }),
      }),
    }),
    fc.record({
      kind: fc.constantFrom(
        'freeze' as const,
        'unfreeze' as const,
        'capture' as const,
        'again' as const,
        'restart' as const,
        'clearMark' as const,
      ),
      timeUtcMs: time,
    }),
    fc.record({
      kind: fc.constant('mark' as const),
      timeUtcMs: time,
      point: hostilePixelPoint(),
      layout: hostileLayout,
      calibration: hostileCalibrationOrNull,
      tapSigmaPx: n,
    }),
    fc.record({
      kind: fc.constant('establishYaw' as const),
      timeUtcMs: time,
      from: fc.oneof(
        fc.constant({ kind: 'compass' as const }),
        fc.record({
          kind: fc.constant('knownAzimuth' as const),
          azimuthRad: n,
          sigmaRad: n,
          northReference: fc.constantFrom('true' as const, 'magnetic' as const),
        }),
      ),
    }),
  );
}

// P-2.6 (Req 2.1, 2.6), the Session: `step` with hostile events in every state, of either kind,
// never throws and leaves only finite numbers in the Session, and asks for no effect on a
// refused event.
describe('P-2.6 the Session is total under hostile events', () => {
  it('never throws and holds only finite numbers', () => {
    const tracker = new ErrorTracker();
    const fixtures = STATES.flatMap((state) =>
      (['bearing', 'altitude'] as const).map((kind) => sessionInState(state, kind).session),
    );
    const sample = sessionInState('live', 'bearing').session.history.samples[0];
    if (sample === undefined) throw new Error('fixture');
    checkProperty(
      'P-2.6 Session',
      fc.property(
        fc.constantFrom(...fixtures),
        fc.array(hostileEvent(sample), { minLength: 1, maxLength: 10 }),
        (start, events) => {
          let session = start;
          for (const event of events) {
            const result = step(session, event, PARAMETERS);
            session = result.session;
            if (!allFinite(session) || !allFinite(result.effects)) {
              tracker.record('non-finite Sessions (must be 0)', 1, '0');
              return false;
            }
          }
          tracker.record('non-finite Sessions (must be 0)', 0, '0');
          return true;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});
