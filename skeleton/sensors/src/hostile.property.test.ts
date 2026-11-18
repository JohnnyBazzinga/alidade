import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  applyYawReference,
  browserEnvironment,
  cameraAxis,
  captureAltitude,
  captureBearing,
  checkPositionFix,
  createBrowserSensorSource,
  createSampleHistory,
  createSimulator,
  declinationAt,
  directionApparentAltitudeRad,
  directionAzimuthRad,
  offAxisRay,
  orientationSampleFromEvent,
  positionFixFromReading,
  rayDirection,
  systemClock,
  trueAzimuthFromMagnetic,
  yawReferenceFromCompass,
  yawReferenceFromKnownAzimuth,
  type SensorSource,
  type SimulatorScript,
} from './index';
import { cappedRuns } from './test-support/fast-check-setup';
import { FakeBrowserEnvironment } from './test-support/fake-browser';
import {
  allFinite,
  hostileFix,
  hostileNullable,
  hostileNumber,
  hostilePosition,
  hostileResets,
  hostileRotation,
  hostileSample,
  hostileSamples,
  hostileWindow,
  hostileYawReference,
  isTotalResult,
} from './test-support/hostile';
import { checkProperty, ErrorTracker } from './test-support/property-report';

/** Calls `f`; true when it neither throws nor returns anything but a total Result. */
function total(f: () => unknown): boolean {
  try {
    return isTotalResult(f());
  } catch {
    return false;
  }
}

function run(
  id: string,
  property: fc.IPropertyWithHooks<[unknown, ...unknown[]]> | fc.IProperty<[unknown, ...unknown[]]>,
): void {
  checkProperty(id, property as fc.IProperty<[unknown, ...unknown[]]>, new ErrorTracker(), {
    numRuns: cappedRuns(),
  });
}

const hostileOffset = fc.option(fc.record({ rightRad: hostileNumber(), upRad: hostileNumber() }), {
  nil: undefined,
});
const hostileDeclination = fc.option(
  fc.record({ declinationRad: hostileNumber(), sigmaRad: hostileNumber() }),
  {
    nil: undefined,
  },
);
const hostileCalibration = fc.record({ offsetRad: hostileNumber(), sigmaRad: hostileNumber() });
const hostileOptions = fc.record({
  listeningTimeoutMs: hostileNumber(),
  positionTimeoutMs: hostileNumber(),
  positionConfidenceScale: hostileNumber(),
});

// P-11.8 — validates Req 11.8 and design D20: for any type-correct input, including hostile
// numbers, nulls, empty and long arrays, every exported function neither throws nor returns NaN or
// an infinity: it returns a failure, or a success whose numbers are all finite. 10 000 cases per
// group in test:deep (design §8).
describe('P-11.8: every exported function is total', () => {
  it('P-11.8 (geometry): rotation, azimuth, altitude, rays', () => {
    run(
      'P-11.8 (geometry)',
      fc.property(
        hostileRotation(),
        fc.record({ east: hostileNumber(), north: hostileNumber(), up: hostileNumber() }),
        hostileOffset,
        (rotation, direction, offset) =>
          total(() => cameraAxis(rotation)) &&
          total(() => directionAzimuthRad(direction)) &&
          total(() => directionApparentAltitudeRad(direction)) &&
          total(() => rayDirection(rotation, offset)) &&
          (offset === undefined || total(() => offAxisRay(rotation, offset))),
      ),
    );
  });

  it('P-11.8 (samples): orientationSampleFromEvent', () => {
    run(
      'P-11.8 (samples)',
      fc.property(
        fc.record({
          type: fc.constantFrom('deviceorientation' as const, 'deviceorientationabsolute' as const),
          alphaDeg: hostileNullable(),
          betaDeg: hostileNullable(),
          gammaDeg: hostileNullable(),
          absolute: fc.boolean(),
          webkitCompassHeadingDeg: hostileNullable(),
          webkitCompassAccuracyDeg: hostileNullable(),
        }),
        hostileNumber(),
        hostileNullable(),
        (raw, timeUtcMs, screenAngleDeg) =>
          total(() => orientationSampleFromEvent(raw, timeUtcMs, screenAngleDeg)),
      ),
    );
  });

  it('P-11.8 (references and declination)', () => {
    run(
      'P-11.8 (references and declination)',
      fc.property(
        hostileSamples(),
        hostileResets(),
        hostileWindow(),
        fc.tuple(hostileNumber(), hostileNumber(), hostileNumber()),
        hostileYawReference(),
        hostileDeclination,
        hostilePosition(),
        hostileOffset,
        (samples, frameResets, window, [a, b, c], reference, declination, position, rayOffset) =>
          total(() =>
            yawReferenceFromCompass({ samples, frameResets, window, headingSigmaRad: a }),
          ) &&
          total(() =>
            yawReferenceFromKnownAzimuth({
              samples,
              frameResets,
              window,
              knownAzimuthRad: a,
              knownSigmaRad: b,
              northReference: 'true',
              ...(rayOffset === undefined ? {} : { rayOffset }),
            }),
          ) &&
          (reference === undefined || total(() => applyYawReference(c, reference))) &&
          total(() => trueAzimuthFromMagnetic(a, declination)) &&
          total(() => declinationAt(position, c)),
      ),
    );
  });

  it('P-11.8 (positions)', () => {
    run(
      'P-11.8 (positions)',
      fc.property(
        fc.record({
          latitudeDeg: hostileNumber(),
          longitudeDeg: hostileNumber(),
          accuracyM: hostileNumber(),
        }),
        fc.tuple(hostileNumber(), hostileNumber(), hostileNumber(), hostileNumber()),
        hostileFix(),
        (reading, [t, scale, staleness, limit], fix) =>
          total(() => positionFixFromReading(reading, t, scale)) &&
          total(() =>
            checkPositionFix(fix, {
              atUtcMs: t,
              positionStalenessMs: staleness,
              coarseLocationLimitM: limit,
            }),
          ),
      ),
    );
  });

  it('P-11.8 (captures)', () => {
    run(
      'P-11.8 (captures)',
      fc.property(
        hostileSamples(),
        hostileResets(),
        hostileWindow(),
        hostileYawReference(),
        hostileDeclination,
        hostileFix(),
        fc.tuple(
          hostileNumber(),
          hostileNumber(),
          hostileNumber(),
          hostileNumber(),
          hostileNumber(),
        ),
        hostileOffset,
        hostileCalibration,
        (
          samples,
          frameResets,
          window,
          yawReference,
          declination,
          positionFix,
          [t, age, heading, stale, coarse],
          rayOffset,
          calibration,
        ) =>
          total(() =>
            captureBearing({
              id: '',
              timeUtcMs: t,
              samples,
              frameResets,
              window,
              ...(rayOffset === undefined ? {} : { rayOffset }),
              ...(yawReference === undefined ? {} : { yawReference }),
              yawReferenceMaxAgeMs: age,
              headingSigmaRad: heading,
              ...(declination === undefined ? {} : { declination }),
              positionFix,
              positionStalenessMs: stale,
              coarseLocationLimitM: coarse,
            }),
          ) &&
          total(() =>
            captureAltitude({
              samples,
              window,
              calibration,
              ...(rayOffset === undefined ? {} : { rayOffset }),
            }),
          ),
      ),
    );
  });

  it('P-11.8 (history)', () => {
    run(
      'P-11.8 (history)',
      fc.property(
        fc.tuple(hostileNumber(), hostileNumber()),
        fc.array(
          fc.oneof(
            hostileSample(),
            fc.record({ timeUtcMs: hostileNumber(), cause: fc.constant('blur' as const) }),
            hostileFix(),
          ),
          { maxLength: 30 },
        ),
        ([sampleRetentionMs, frameResetRetentionMs], items) => {
          const created = createSampleHistory({ sampleRetentionMs, frameResetRetentionMs });
          if (!isTotalResult(created)) return false;
          if (!created.ok) return true;
          let history = created.value;
          for (const item of items) {
            const next =
              'rotation' in item
                ? addOrientationSample(history, item)
                : 'cause' in item
                  ? addFrameReset(history, item)
                  : addPositionFix(history, item);
            if (!isTotalResult(next)) return false;
            if (next.ok) history = next.value;
          }
          return allFinite(history);
        },
      ),
    );
  });

  it('P-11.8 (simulator): hostile scripts, seeds, options and advances', async () => {
    const pending: Promise<unknown>[] = [];
    const keyframe = fc.record({
      timeUtcMs: hostileNumber(),
      azimuthRad: hostileNumber(),
      apparentAltitudeRad: hostileNumber(),
      rollRad: hostileNumber(),
    });
    const script: fc.Arbitrary<SimulatorScript> = fc.record({
      startUtcMs: fc.oneof(hostileNumber(), fc.constant(1_790_000_000_000)),
      eventIntervalMs: fc.oneof(hostileNumber(), fc.constantFrom(1, 50)),
      pose: fc.array(keyframe, { maxLength: 3 }),
      orientationNoiseSigmaRad: hostileNumber(),
      altitudeBiasRad: hostileNumber(),
      frame: fc.oneof(
        fc.record({
          kind: fc.constant('absolute' as const),
          northErrorRad: hostileNumber(),
          resets: fc.array(
            fc.record({ timeUtcMs: hostileNumber(), cause: fc.constant('hidden' as const) }),
            { maxLength: 2 },
          ),
        }),
        fc.record({
          kind: fc.constant('relative' as const),
          zeroRad: hostileNumber(),
          resets: fc.array(
            fc.record({
              timeUtcMs: hostileNumber(),
              cause: fc.constant('blur' as const),
              newZeroRad: hostileNumber(),
            }),
            { maxLength: 2 },
          ),
        }),
      ),
      heading: fc.option(
        fc.record({
          biasRad: hostileNumber(),
          noiseSigmaRad: hostileNumber(),
          jumps: fc.array(
            fc.record({
              startUtcMs: hostileNumber(),
              durationMs: hostileNumber(),
              sizeRad: hostileNumber(),
            }),
            { maxLength: 2 },
          ),
          reportedAccuracyDeg: hostileNumber(),
        }),
        { nil: null },
      ),
      screenAngleDeg: hostileNullable(),
      declinationRad: hostileNumber(),
      position: fc.oneof(
        fc.constant(null),
        fc.record({
          kind: fc.constant('fix' as const),
          position: hostilePosition(),
          reportedAccuracyM: hostileNumber(),
          firstFixDelayMs: hostileNumber(),
          fixIntervalMs: hostileNumber(),
        }),
        fc.record({
          kind: fc.constant('failure' as const),
          reason: fc.constant('position_timeout' as const),
        }),
      ),
      orientation: fc.constantFrom('available' as const, 'missing' as const),
      orientationPermission: fc.constantFrom(
        'not_required' as const,
        'granted' as const,
        'denied' as const,
      ),
      secureContext: fc.boolean(),
    });
    run(
      'P-11.8 (simulator)',
      fc.property(
        script,
        fc.oneof(hostileNumber(), fc.constant(7)),
        fc.oneof(
          hostileOptions,
          fc.constant({
            listeningTimeoutMs: 3000,
            positionTimeoutMs: 30_000,
            positionConfidenceScale: 1,
          }),
        ),
        fc.array(hostileNumber(), { maxLength: 4 }),
        (s, seed, options, advances) => {
          let created: ReturnType<typeof createSimulator>;
          try {
            created = createSimulator(s, seed, options);
          } catch {
            return false;
          }
          if (!isTotalResult(created)) return false;
          if (!created.ok) return true;
          return exerciseSource(created.value.source, pending, () =>
            advances.every((a) =>
              total(
                () =>
                  created.ok &&
                  created.value.controls.advanceTo(
                    created.value.source.now() + (Number.isFinite(a) ? Math.abs(a) % 4_000_000 : a),
                  ),
              ),
            ),
          );
        },
      ),
    );
    const settled = await Promise.allSettled(pending);
    expect(settled.every((r) => r.status === 'fulfilled' && isTotalResult(r.value))).toBe(true);
  });

  it('P-11.8 (browser): a fake environment whose calls throw, hostile events and clocks', async () => {
    const pending: Promise<unknown>[] = [];
    const callNames = [
      'clock',
      'addWindowListener:deviceorientation',
      'addWindowListener:blur',
      'addVisibilityListener',
      'visibilityState',
      'screenAngleDeg',
      'setTimer',
      'clearTimer',
      'watchPosition',
      'clearWatch',
      'removeWindowListener:deviceorientation',
      'requestPermission',
    ];
    const hostileEvent = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(42),
      fc.record({
        alpha: fc.oneof(hostileNumber(), fc.constant(null), fc.constant('10')),
        beta: fc.oneof(hostileNumber(), fc.constant(null)),
        gamma: fc.oneof(hostileNumber(), fc.constant(null)),
        absolute: fc.oneof(fc.boolean(), fc.constant(1), fc.constant('true')),
        webkitCompassHeading: hostileNumber(),
        webkitCompassAccuracy: hostileNumber(),
      }),
    );
    run(
      'P-11.8 (browser)',
      fc.property(
        fc.subarray(callNames, { maxLength: 3 }),
        fc.record({
          isSecureContext: fc.boolean(),
          hasDeviceOrientation: fc.boolean(),
          supportsAbsoluteOrientation: fc.boolean(),
          permission: fc.constantFrom(
            null,
            'granted' as const,
            'denied' as const,
            'reject' as const,
          ),
          hasGeolocation: fc.boolean(),
          screenAngleDeg: hostileNullable(),
          startUtcMs: fc.oneof(hostileNumber(), fc.constant(1_790_000_000_000)),
        }),
        fc.oneof(
          hostileOptions,
          fc.constant({
            listeningTimeoutMs: 3000,
            positionTimeoutMs: 30_000,
            positionConfidenceScale: 1,
          }),
        ),
        fc.array(hostileEvent, { maxLength: 5 }),
        fc.array(fc.tuple(hostileNumber(), hostileNumber(), hostileNumber()), { maxLength: 2 }),
        fc.array(hostileNumber(), { maxLength: 3 }),
        (throwOn, fake, options, events, readings, steps) => {
          const env = new FakeBrowserEnvironment({ ...fake, throwOn });
          let created: ReturnType<typeof createBrowserSensorSource>;
          try {
            created = createBrowserSensorSource(env, env.clock, options);
          } catch {
            return false;
          }
          if (!isTotalResult(created)) return false;
          if (!created.ok) return true;
          return exerciseSource(created.value, pending, () => {
            try {
              for (const event of events) {
                env.dispatch('deviceorientation', event);
                env.dispatch('deviceorientationabsolute', event);
              }
              env.dispatch('blur');
              env.setVisibility('hidden');
              for (const [lat, lon, accuracy] of readings) env.deliverPosition(lat, lon, accuracy);
              env.deliverPositionError(Number.NaN);
              for (const step of steps)
                env.advance(Number.isFinite(step) ? Math.abs(step) % 100_000 : 1000);
              return true;
            } catch {
              return false;
            }
          });
        },
      ),
    );
    const settled = await Promise.allSettled(pending);
    expect(settled.every((r) => r.status === 'fulfilled' && isTotalResult(r.value))).toBe(true);
  });

  it('P-11.8 (globals): browserEnvironment and systemClock outside a browser', () => {
    expect(() => browserEnvironment()).not.toThrow();
    expect(Number.isFinite(systemClock())).toBe(true);
    const env = browserEnvironment();
    const created = createBrowserSensorSource(env, systemClock, {
      listeningTimeoutMs: 3000,
      positionTimeoutMs: 30_000,
      positionConfidenceScale: 1,
    });
    expect(isTotalResult(created)).toBe(true);
  });
});

/**
 * Drives a source through every method and listener, with a listener that throws, collecting the
 * promises it returns. True when nothing throws and every synchronous value is total.
 */
function exerciseSource(
  source: SensorSource,
  pending: Promise<unknown>[],
  drive: () => boolean,
): boolean {
  try {
    const delivered: unknown[] = [];
    source.onOrientation((sample) => delivered.push(sample));
    source.onPosition((fix) => delivered.push(fix));
    source.onFrameReset((reset) => delivered.push({ ok: true, value: reset }));
    source.onOrientation(() => {
      throw new Error('hostile listener');
    });
    pending.push(
      source.requestOrientationPermission(),
      source.startOrientation(),
      source.startPosition(),
    );
    pending.push(source.startOrientation());
    const driven = drive();
    pending.push(source.startPosition());
    source.stop();
    pending.push(source.startOrientation());
    source.stop();
    return driven && Number.isFinite(source.now()) && delivered.every(isTotalResult);
  } catch {
    return false;
  }
}
