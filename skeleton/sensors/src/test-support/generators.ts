// Shared fast-check generators (design §8). Each documents the domain it draws from and what it
// excludes (testing.md rule 4).

import fc from 'fast-check';
import type { DeviceRotation } from '../rotation';
import type { RayOffset } from '../ray';

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const DEG = Math.PI / 180;

const TWO_POW_53 = 2 ** 53;

/**
 * A double drawn uniformly from [min, max). `fc.double` is not used for this: it draws evenly
 * over the representable doubles, so most of its draws are tiny in magnitude, which would put the
 * phone flat far more often than a uniform angle does. 53 random bits give a uniform fraction.
 */
export function uniform(min: number, max: number): fc.Arbitrary<number> {
  // `noBias`: fast-check otherwise favours small integers, which would favour `min`.
  return fc.noBias(fc.integer({ min: 0, max: TWO_POW_53 - 1 })).map((n) => {
    const value = min + (max - min) * (n / TWO_POW_53);
    return value < max ? value : min; // rounding can reach max; keep the interval half-open
  });
}

/** A double uniform in [min, max), never NaN. */
function halfOpen(min: number, max: number): fc.Arbitrary<number> {
  return uniform(min, max);
}

/** A double uniform in [min, max], with both ends drawn on purpose. */
export function closed(min: number, max: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(min, max) },
    { weight: 9, arbitrary: uniform(min, max) },
  );
}

/** `10^k` with `k` uniform in [-17, -2]. */
export function logScaleMagnitude(): fc.Arbitrary<number> {
  return uniform(-17, -2).map((exponent) => 10 ** exponent);
}

/** `s · 10^k` with `s = ±1` and `k` uniform in [-17, -2]: log-scale offsets near a singularity. */
export function logScaleOffset(): fc.Arbitrary<number> {
  return fc
    .tuple(fc.boolean(), logScaleMagnitude())
    .map(([negative, magnitude]) => (negative ? -magnitude : magnitude));
}

const uniformAlpha = halfOpen(0, TWO_PI);
const uniformBeta = halfOpen(-Math.PI, Math.PI);
const uniformGamma = halfOpen(-HALF_PI, HALF_PI);

/**
 * `deviceRotation`: `alpha ∈ [0, 2π)`, `beta ∈ [-π, π)`, `gamma ∈ [-π/2, π/2)` (Req 2.7).
 * Half the draws are uniform. The other half are edge cases:
 * - near gimbal lock (the upright phone): `beta = ±π/2 + s·10^k` (`k ∈ [-17, -2]`) or `±π/2`
 *   exactly, with `gamma` equal to `0`, `s·10^k`, `-π/2`, `-π/2 + 10^k`, or uniform. Offsets
 *   below about 1e-16 round to `±π/2` itself; those draws are kept, since the browser can
 *   deliver that exact value;
 * - other edges: `beta = 0` (flat), `gamma = 0`, `gamma = -π/2`, `alpha = 0`.
 * Excludes nothing within the domain.
 */
export function deviceRotation(): fc.Arbitrary<DeviceRotation> {
  const nearLockBeta = fc.oneof(
    fc.constantFrom(HALF_PI, -HALF_PI),
    fc
      .tuple(fc.constantFrom(HALF_PI, -HALF_PI), logScaleOffset())
      .map(([base, offset]) => base + offset),
  );
  const nearLockGamma = fc.oneof(
    fc.constant(0),
    logScaleOffset(),
    fc.constant(-HALF_PI),
    logScaleMagnitude().map((magnitude) => -HALF_PI + magnitude),
    uniformGamma,
  );
  const nearLock = fc.record({
    alphaRad: uniformAlpha,
    betaRad: nearLockBeta,
    gammaRad: nearLockGamma,
  });
  const otherEdges = fc.oneof(
    fc.record({ alphaRad: uniformAlpha, betaRad: fc.constant(0), gammaRad: uniformGamma }),
    fc.record({ alphaRad: uniformAlpha, betaRad: uniformBeta, gammaRad: fc.constant(0) }),
    fc.record({ alphaRad: uniformAlpha, betaRad: uniformBeta, gammaRad: fc.constant(-HALF_PI) }),
    fc.record({ alphaRad: fc.constant(0), betaRad: uniformBeta, gammaRad: uniformGamma }),
  );
  const uniform = fc.record({
    alphaRad: uniformAlpha,
    betaRad: uniformBeta,
    gammaRad: uniformGamma,
  });
  return fc.oneof(
    { weight: 4, arbitrary: uniform },
    { weight: 3, arbitrary: nearLock },
    { weight: 1, arbitrary: otherEdges },
  );
}

/** The horizontal part of the Camera axis, `hypot(east, north)`, from the closed formula. */
export function horizontalPart(r: DeviceRotation): number {
  const east = -(
    Math.cos(r.alphaRad) * Math.sin(r.gammaRad) +
    Math.sin(r.alphaRad) * Math.sin(r.betaRad) * Math.cos(r.gammaRad)
  );
  const north = -(
    Math.sin(r.alphaRad) * Math.sin(r.gammaRad) -
    Math.cos(r.alphaRad) * Math.sin(r.betaRad) * Math.cos(r.gammaRad)
  );
  return Math.hypot(east, north);
}

/**
 * `horizontalRotation`: a `deviceRotation` whose Camera axis has a horizontal part of at least
 * `1e-3` (Req 2.9). Excludes the phone within about 0.06° of flat, face up or face down; those
 * axes are covered by the `axis_vertical` examples. Discard rate, measured on 100 000 draws with
 * seed 20261117: 1 draw in 100 000 (0.001 %), a `gamma = 0` edge draw with `beta` near `±π`.
 */
export function horizontalRotation(): fc.Arbitrary<DeviceRotation> {
  return deviceRotation().filter((r) => horizontalPart(r) >= 1e-3);
}

/** `smallRotationChange`: `Δα, Δβ, Δγ ∈ [-1e-3, 1e-3]` each, ends included (Req 2.10). */
export function smallRotationChange(): fc.Arbitrary<DeviceRotation> {
  const delta = closed(-1e-3, 1e-3);
  return fc.record({ alphaRad: delta, betaRad: delta, gammaRad: delta });
}

/** `rayOffset`: `rightRad, upRad ∈ [-80°, 80°]`, the ends and `0` drawn on purpose (Req 3.6). */
export function rayOffset(): fc.Arbitrary<RayOffset> {
  const limit = 80 * DEG;
  const component = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(-limit, 0, limit) },
    { weight: 9, arbitrary: uniform(-limit, limit) },
  );
  return fc.record({ rightRad: component, upRad: component });
}

/** A camera pose for the Simulator's inverse rotation: direction in the frame and roll. */
export interface CameraPose {
  readonly azimuthRad: number;
  readonly apparentAltitudeRad: number;
  readonly rollRad: number;
}

/**
 * `cameraPose` (P-12.6): azimuth in [0, 2π), altitude in [-80°, 80°], roll in [-π, π). Half the
 * draws are uniform. The other half are near gimbal lock: altitude `0` exactly or `s·10^k`
 * (`k ∈ [-17, -2]`), and roll `0`, `±π/2` or `-π` exactly, or `0` or `±π/2` plus `s·10^k`, or
 * `π - 10^k`, or `-π + 10^k`. Upright with no roll is the W3C gimbal lock (`beta = 90°`); a roll
 * of `±π/2` puts the phone on its side, and `±π` upside down. Excludes altitudes beyond ±80°, which
 * the examples cover.
 */
export function cameraPose(): fc.Arbitrary<CameraPose> {
  const limit = 80 * DEG;
  const uniformPose = fc.record({
    azimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: closed(-limit, limit),
    rollRad: halfOpen(-Math.PI, Math.PI),
  });
  const nearLockAltitude = fc.oneof(fc.constant(0), logScaleOffset());
  const nearLockRoll = fc.oneof(
    fc.constantFrom(0, HALF_PI, -HALF_PI, -Math.PI),
    fc
      .tuple(fc.constantFrom(0, HALF_PI, -HALF_PI), logScaleOffset())
      .map(([base, offset]) => base + offset),
    // π - 10^k rounds to π itself below about 1e-16; π is outside [-π, π), and the same roll as
    // -π, so it is written as -π.
    logScaleMagnitude().map((magnitude) =>
      Math.PI - magnitude < Math.PI ? Math.PI - magnitude : -Math.PI,
    ),
    logScaleMagnitude().map((magnitude) => -Math.PI + magnitude),
  );
  const nearLockPose = fc.record({
    azimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: nearLockAltitude,
    rollRad: nearLockRoll,
  });
  return fc.oneof(uniformPose, nearLockPose);
}

/** True for the near-gimbal-lock draws of `cameraPose`, which the reports give separately. */
export function isNearLockPose(pose: CameraPose): boolean {
  return Math.abs(pose.apparentAltitudeRad) <= 1e-2;
}

/** One sample of a compass scenario: its pose in the Relative frame. */
export interface CompassScenarioSample {
  readonly relativeAzimuthRad: number;
  readonly apparentAltitudeRad: number;
  readonly rollRad: number;
  /** `null` or not negative: always usable (Req 5.8). */
  readonly compassAccuracyRad: number | null;
}

export interface CompassScenario {
  /** `wrapTwoPi(relative + offset)` is each sample's heading; in (-π, π]. */
  readonly offsetRad: number;
  readonly samples: readonly CompassScenarioSample[];
}

/**
 * `compassScenario` (P-5.14, Req 5.14): an offset in (-π, π] (`π` drawn on purpose) and 1 to 50
 * samples, each with a relative azimuth in [0, 2π), an altitude in [-30°, 30°] (ends drawn) and a
 * roll in [-π, π), and a reported accuracy that is `null` or in [0°, 20°]. The test gives every
 * sample Screen angle 0, the heading `wrapTwoPi(relative + offset)` exactly, and a window that
 * contains every sample. Excludes negative accuracies (covered by examples).
 *
 * The altitude drawn is the pose's; the sample's Camera altitude is the one computed back from its
 * rotation, which can differ by rounding. Req 5.14's domain is the computed altitude, so the test
 * applies `fc.pre` to it: of the poses drawn at exactly ±30°, about 29 % come back outside the
 * limit by at most 5.6e-16 rad, and those cases are discarded and counted.
 */
export function compassScenario(): fc.Arbitrary<CompassScenario> {
  const limit = 30 * DEG;
  const sample = fc.record({
    relativeAzimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: closed(-limit, limit),
    rollRad: halfOpen(-Math.PI, Math.PI),
    compassAccuracyRad: fc.oneof(fc.constant(null), closed(0, 20 * DEG)),
  });
  const offset = fc.oneof(
    { weight: 1, arbitrary: fc.constant(Math.PI) },
    {
      weight: 19,
      arbitrary: uniform(-Math.PI, Math.PI).map((x) => (x === -Math.PI ? Math.PI : x)),
    },
  );
  return fc.record({
    offsetRad: offset,
    samples: fc.array(sample, { minLength: 1, maxLength: 50 }),
  });
}

export interface KnownAzimuthScenario {
  readonly rotation: DeviceRotation;
  readonly sampleCount: number;
  readonly knownAzimuthRad: number;
  readonly knownSigmaRad: number;
  readonly northReference: 'true' | 'magnetic';
}

/**
 * `knownAzimuthScenario` (P-5.15, Req 5.15): a `deviceRotation` repeated over 1 to 50 sample
 * times, a known azimuth in [0, 2π), a known 1-sigma in [0, 45°] (ends drawn) and a North
 * reference. The frame is given by the test, which runs once per frame. The horizontal-part
 * condition of `horizontalRotation` is applied by the test with `fc.pre`, so that its discards are
 * counted.
 */
export function knownAzimuthScenario(): fc.Arbitrary<KnownAzimuthScenario> {
  return fc.record({
    rotation: deviceRotation(),
    sampleCount: fc.integer({ min: 1, max: 50 }),
    knownAzimuthRad: halfOpen(0, TWO_PI),
    knownSigmaRad: closed(0, 45 * DEG),
    northReference: fc.constantFrom('true' as const, 'magnetic' as const),
  });
}

/**
 * `geolocationReading` (P-7.9, P-7.10): latitude in [-89°, 89°], longitude in [-180°, 180°] and
 * accuracy in [0, 10 000] m, ends drawn on purpose (-180° included, Req 7.9), with a confidence
 * scale in [0.1, 10] (ends drawn). Excludes latitudes beyond 89°, which the examples cover.
 */
export function geolocationReading(): fc.Arbitrary<{
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly accuracyM: number;
  readonly confidenceScale: number;
}> {
  const longitude = closed(-180, 180);
  return fc.record({
    latitudeDeg: closed(-89, 89),
    longitudeDeg: longitude,
    accuracyM: closed(0, 10_000),
    confidenceScale: closed(0.1, 10),
  });
}

/**
 * `wmmPositionAndTime` (P-6.12): a Supported position and a time within WMM2025's validity. The
 * latitude is uniform on the sphere in [-89°, 89°] (by `asin` of a uniform sine), and in one draw
 * of four instead within 25° of a pole, where the magnetic poles and the declinations above 90°
 * are; the longitude is uniform in (-π, π]. The time is uniform over
 * [Date.UTC(2025, 0, 1), Date.UTC(2030, 0, 1)), the first and last millisecond drawn on purpose.
 * Excludes nothing within the domain.
 */
export function wmmPositionAndTime(): fc.Arbitrary<{
  readonly latRad: number;
  readonly lonRad: number;
  readonly timeUtcMs: number;
  readonly magneticAzimuthRad: number;
}> {
  const limit = 89 * DEG;
  const sphere = uniform(Math.sin(-limit), Math.sin(limit)).map((sine) => Math.asin(sine));
  const polar = fc
    .tuple(fc.boolean(), uniform(64 * DEG, limit))
    .map(([south, latRad]) => (south ? -latRad : latRad));
  const latitude = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(-limit, limit) },
    { weight: 3, arbitrary: polar },
    { weight: 8, arbitrary: sphere },
  );
  const longitude = uniform(-Math.PI, Math.PI).map((x) => (x === -Math.PI ? Math.PI : x));
  const fromUtcMs = Date.UTC(2025, 0, 1);
  const untilUtcMs = Date.UTC(2030, 0, 1);
  const time = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(fromUtcMs, untilUtcMs - 1) },
    { weight: 19, arbitrary: fc.integer({ min: fromUtcMs, max: untilUtcMs - 1 }) },
  );
  return fc.record({
    latRad: latitude,
    lonRad: longitude,
    timeUtcMs: time,
    magneticAzimuthRad: uniform(0, TWO_PI),
  });
}

/** One sample of a capture scenario: a pose in the Relative frame. */
export interface CaptureScenarioSample {
  readonly relativeAzimuthRad: number;
  readonly apparentAltitudeRad: number;
  readonly rollRad: number;
}

export interface CaptureScenario {
  readonly samples: readonly CaptureScenarioSample[];
  /** The Yaw reference's offset, in (-π, π]; North reference `true`, Relative frame. */
  readonly yawOffsetRad: number;
  /** The Yaw reference's 1-sigma, in [0, 10°]. */
  readonly yawSigmaRad: number;
  /** Random keys, one per sample, for a permutation (P-8.12). */
  readonly orderKeys: readonly number[];
}

const yawOffset = (): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant(Math.PI) },
    {
      weight: 19,
      arbitrary: uniform(-Math.PI, Math.PI).map((x) => (x === -Math.PI ? Math.PI : x)),
    },
  );

function captureScenario(
  centre: fc.Arbitrary<number>,
  deviations: (count: number) => fc.Arbitrary<readonly number[]>,
  identical: boolean,
  offset: (centreRad: number) => fc.Arbitrary<number>,
): fc.Arbitrary<CaptureScenario> {
  const limit = 30 * DEG;
  return fc.integer({ min: 2, max: 200 }).chain((count) =>
    fc.tuple(centre, deviations(count)).chain(([centreRad, deviationsRad]) => {
      const pose = fc.record({
        apparentAltitudeRad: closed(-limit, limit),
        rollRad: halfOpen(-Math.PI, Math.PI),
      });
      const poses = identical
        ? pose.map((p) => Array.from({ length: count }, () => p))
        : fc.array(pose, { minLength: count, maxLength: count });
      return fc.record({
        samples: poses.map((list) =>
          list.map((p, i) => ({
            relativeAzimuthRad: identical ? centreRad : centreRad + (deviationsRad[i] ?? 0),
            apparentAltitudeRad: p.apparentAltitudeRad,
            rollRad: p.rollRad,
          })),
        ),
        yawOffsetRad: offset(centreRad),
        yawSigmaRad: closed(0, 10 * DEG),
        orderKeys: fc.array(fc.integer(), { minLength: count, maxLength: count }),
      });
    }),
  );
}

/**
 * `clusteredCapture` (P-8.11 to P-8.13): 2 to 200 Relative-frame samples whose relative azimuths
 * lie within 30° of a centre in [0, 2π) (deviations in [-30°, 30°], ends drawn), each at an
 * altitude in [-30°, 30°] with a roll in [-π, π); a true Yaw reference with an offset in (-π, π]
 * (`π` drawn) and a 1-sigma in [0, 10°]. The true azimuths, relative plus offset, then lie within
 * 30° of `centre + offset`, as Req 8.11 states. Excludes nothing within that domain.
 */
export function clusteredCapture(): fc.Arbitrary<CaptureScenario> {
  const limit = 30 * DEG;
  return captureScenario(
    halfOpen(0, TWO_PI),
    (count) => fc.array(closed(-limit, limit), { minLength: count, maxLength: count }),
    false,
    () => yawOffset(),
  );
}

/**
 * `clusteredCapture` `straddling` (P-8.15): as `clusteredCapture`, with the true centre in
 * [-15°, 15°] and the first two deviations exactly -30° and +30°, so that the true azimuths always
 * lie on both sides of the 0 / 2π boundary.
 */
export function straddlingCapture(): fc.Arbitrary<CaptureScenario> {
  const limit = 30 * DEG;
  return fc
    .tuple(halfOpen(0, TWO_PI), closed(-15 * DEG, 15 * DEG))
    .chain(([relativeCentreRad, trueCentreRad]) =>
      captureScenario(
        fc.constant(relativeCentreRad),
        (count) =>
          fc
            .array(closed(-limit, limit), { minLength: count, maxLength: count })
            .map((deviations) =>
              deviations.map((d, i) => (i === 0 ? -limit : i === 1 ? limit : d)),
            ),
        false,
        () =>
          fc.constant(
            Math.atan2(
              Math.sin(trueCentreRad - relativeCentreRad),
              Math.cos(trueCentreRad - relativeCentreRad),
            ),
          ),
      ),
    );
}

/** `clusteredCapture` `identical` (P-8.14): one pose repeated 2 to 200 times. */
export function identicalCapture(): fc.Arbitrary<CaptureScenario> {
  return captureScenario(
    halfOpen(0, TWO_PI),
    () => fc.constant([]),
    true,
    () => yawOffset(),
  );
}

export interface AltitudeScenario {
  readonly poses: readonly {
    readonly azimuthRad: number;
    readonly apparentAltitudeRad: number;
    readonly rollRad: number;
  }[];
  /** A shift that keeps every pose altitude in [-80°, 80°] (P-9.8). */
  readonly shiftRad: number;
  readonly calibrationOffsetRad: number;
  readonly calibrationSigmaRad: number;
  readonly orderKeys: readonly number[];
}

/**
 * `altitudeSet` (P-9.7 to P-9.9): 2 to 200 poses with altitudes in [-80°, 80°], any azimuth and
 * roll; a shift drawn from the range that keeps every pose altitude in [-80°, 80°] (its ends
 * drawn); a calibration offset in [-10°, 10°] and sigma in [0, 10°], ends drawn. An `identical`
 * variant repeats one pose (P-9.7).
 *
 * The altitude ends ±80° are drawn in at most one pose per case (in one case of five): with the
 * ends drawn in any pose, a case of up to 200 poses usually held several, and one rounding out of
 * the domain discarded the whole case (3.3 discards per accepted case at checkpoint 13). The
 * altitudes the properties use are the Camera altitudes computed back from the rotations, which can
 * round a pose at ±80° just outside; the properties discard those cases with `fc.pre`.
 */
export function altitudeSet(identical = false): fc.Arbitrary<AltitudeScenario> {
  const limit = 80 * DEG;
  const pose = (altitude: fc.Arbitrary<number>) =>
    fc.record({
      azimuthRad: halfOpen(0, TWO_PI),
      apparentAltitudeRad: altitude,
      rollRad: halfOpen(-Math.PI, Math.PI),
    });
  const inside = pose(uniform(-limit, limit));
  const atEnd = pose(fc.constantFrom(-limit, limit));
  return fc.integer({ min: 2, max: 200 }).chain((count) => {
    const endIndex = fc.oneof(
      { weight: 4, arbitrary: fc.constant(-1) },
      { weight: 1, arbitrary: fc.integer({ min: 0, max: count - 1 }) },
    );
    const poses = identical
      ? fc
          .oneof({ weight: 4, arbitrary: inside }, { weight: 1, arbitrary: atEnd })
          .map((p) => Array.from({ length: count }, () => p))
      : fc
          .tuple(fc.array(inside, { minLength: count, maxLength: count }), endIndex, atEnd)
          .map(([list, index, end]) => list.map((p, i) => (i === index ? end : p)));
    return poses.chain((list) => {
      const lowest = Math.min(...list.map((p) => p.apparentAltitudeRad));
      const highest = Math.max(...list.map((p) => p.apparentAltitudeRad));
      return fc.record({
        poses: fc.constant(list),
        shiftRad: closed(-limit - lowest, limit - highest),
        calibrationOffsetRad: closed(-10 * DEG, 10 * DEG),
        calibrationSigmaRad: closed(0, 10 * DEG),
        orderKeys: fc.array(fc.integer(), { minLength: count, maxLength: count }),
      });
    });
  });
}

/** One item of a history sequence: a sample's pose, or a reset's cause. */
export type HistoryItem =
  | {
      readonly kind: 'sample';
      readonly timeUtcMs: number;
      readonly azimuthRad: number;
      readonly apparentAltitudeRad: number;
      readonly rollRad: number;
    }
  | {
      readonly kind: 'reset';
      readonly timeUtcMs: number;
      readonly cause: 'hidden' | 'blur' | 'pagehide' | 'restart' | 'frame_change';
    };

export interface HistorySequence {
  readonly frame: 'relative' | 'absolute';
  readonly items: readonly HistoryItem[];
  readonly sampleRetentionMs: number;
  readonly frameResetRetentionMs: number;
  readonly dense: boolean;
}

/** An integer drawn uniformly in [min, max], without fast-check's bias toward small values. */
export function uniformInteger(min: number, max: number): fc.Arbitrary<number> {
  return fc.noBias(fc.integer({ min, max }));
}

const HISTORY_START_UTC_MS = 1_790_000_000_000;

/**
 * `historySequence` (P-14.6, P-14.7): 0 to 300 Orientation samples and 0 to 10 Frame resets,
 * interleaved in any order, with times that do not decrease and span up to 200 000 ms, ties drawn
 * on purpose (a step of 0 in one draw of ten); a sample retention in [100, 10 000] ms and a Frame
 * reset retention in [1000, 150 000] ms, ends drawn (Req 14.6). Half the sequences are dense, with
 * steps of 5 to 50 ms, so that a Sighting window holds enough samples for a capture to succeed;
 * the others spread their items over up to 200 000 ms. `historyCapture` draws three dense
 * sequences in four (`denseShare` 0.75), so that enough of its captures succeed. The samples share one frame, with
 * azimuths within 30° of a centre and altitudes in [-30°, 30°]; the resets have any cause.
 */
export function historySequence(denseShare: 0.5 | 0.75 = 0.5): fc.Arbitrary<HistorySequence> {
  const limit = 30 * DEG;
  return fc
    .record({
      sampleCount: fc.integer({ min: 0, max: 300 }),
      resetCount: fc.integer({ min: 0, max: 10 }),
      dense: fc.oneof(
        { weight: denseShare === 0.5 ? 1 : 3, arbitrary: fc.constant(true) },
        { weight: 1, arbitrary: fc.constant(false) },
      ),
      frame: fc.constantFrom('relative' as const, 'absolute' as const),
      centreRad: halfOpen(0, TWO_PI),
    })
    .chain(({ sampleCount, resetCount, dense, frame, centreRad }) => {
      const count = sampleCount + resetCount;
      const maxStep = dense ? 50 : Math.max(1, Math.floor(200_000 / Math.max(1, count)));
      const step = fc.oneof(
        { weight: 1, arbitrary: fc.constant(0) },
        { weight: 9, arbitrary: uniformInteger(dense ? 5 : 0, maxStep) },
      );
      const sample = fc.record({
        deviationRad: closed(-limit, limit),
        apparentAltitudeRad: closed(-limit, limit),
        rollRad: halfOpen(-Math.PI, Math.PI),
      });
      const cause = fc.constantFrom(
        'hidden' as const,
        'blur' as const,
        'pagehide' as const,
        'restart' as const,
        'frame_change' as const,
      );
      return fc.record({
        frame: fc.constant(frame),
        dense: fc.constant(dense),
        sampleRetentionMs: closed(100, 10_000),
        frameResetRetentionMs: closed(1000, 150_000),
        items: fc
          .tuple(
            fc.array(sample, { minLength: sampleCount, maxLength: sampleCount }),
            fc.array(cause, { minLength: resetCount, maxLength: resetCount }),
            fc.array(step, { minLength: count, maxLength: count }),
            fc.array(fc.nat(), { minLength: count, maxLength: count }),
          )
          .map(([samples, causes, steps, keys]) => {
            // Interleave by random keys, then give the items non-decreasing times.
            const kinds = [
              ...samples.map((s) => ({ kind: 'sample' as const, s })),
              ...causes.map((c) => ({ kind: 'reset' as const, c })),
            ]
              .map((entry, index) => ({ entry, key: keys[index] ?? 0, index }))
              .sort((a, b) => a.key - b.key || a.index - b.index)
              .map((x) => x.entry);
            let timeUtcMs = HISTORY_START_UTC_MS;
            return kinds.map((entry, index): HistoryItem => {
              timeUtcMs += steps[index] ?? 0;
              return entry.kind === 'sample'
                ? {
                    kind: 'sample',
                    timeUtcMs,
                    azimuthRad: centreRad + entry.s.deviationRad,
                    apparentAltitudeRad: entry.s.apparentAltitudeRad,
                    rollRad: entry.s.rollRad,
                  }
                : { kind: 'reset', timeUtcMs, cause: entry.c };
            });
          }),
      });
    });
}

export interface HistoryCapture {
  readonly sequence: HistorySequence;
  readonly windowStartUtcMs: number;
  readonly windowLengthMs: number;
  readonly minSampleCount: number;
  readonly establishedUtcMs: number;
  readonly northReference: 'true' | 'magnetic';
}

/**
 * `historyCapture` (P-14.7): a `historySequence` with newest time `T` and a bearing capture on it.
 * The window starts in `[T − min(sampleRetention, resetRetention), T]`, with a length in
 * [1, 2000] ms and a minimum count in [1, 20]; for dense sequences three captures in four instead
 * end exactly at `T`, with a length in [1, min(sampleRetention, resetRetention, 2000)] ms, so that
 * their samples are fresh. The Yaw reference is of the sequence's frame, established in
 * `[T − resetRetention, T + 2000]`; the property gives it a maximum age that covers it. Every draw
 * meets the conditions of Req 14.7. Times and lengths are drawn without fast-check's bias toward
 * small integers (`uniformInteger`), which would make most windows a few milliseconds long. The
 * fraction of successful captures is printed by P-14.7.
 */
export function historyCapture(): fc.Arbitrary<HistoryCapture> {
  return historySequence(0.75).chain((sequence) => {
    const last = sequence.items[sequence.items.length - 1];
    const newestUtcMs = last === undefined ? HISTORY_START_UTC_MS : last.timeUtcMs;
    const reach = Math.min(sequence.sampleRetentionMs, sequence.frameResetRetentionMs);
    const anywhere = fc.record({
      windowStartUtcMs: uniformInteger(Math.ceil(newestUtcMs - reach), newestUtcMs),
      windowLengthMs: uniformInteger(1, 2000),
    });
    const endingAtNewest = uniformInteger(1, Math.max(1, Math.floor(Math.min(reach, 2000)))).map(
      (windowLengthMs) => ({
        windowStartUtcMs: newestUtcMs - windowLengthMs,
        windowLengthMs,
      }),
    );
    const window = sequence.dense
      ? fc.oneof({ weight: 1, arbitrary: anywhere }, { weight: 3, arbitrary: endingAtNewest })
      : anywhere;
    return fc
      .record({
        sequence: fc.constant(sequence),
        window,
        minSampleCount: fc.integer({ min: 1, max: 20 }),
        establishedUtcMs: uniformInteger(
          Math.ceil(newestUtcMs - sequence.frameResetRetentionMs),
          newestUtcMs + 2000,
        ),
        northReference: fc.constantFrom('true' as const, 'magnetic' as const),
      })
      .map(({ sequence: s, window: w, minSampleCount, establishedUtcMs, northReference }) => ({
        sequence: s,
        windowStartUtcMs: w.windowStartUtcMs,
        windowLengthMs: w.windowLengthMs,
        minSampleCount,
        establishedUtcMs,
        northReference,
      }));
  });
}

/** The two windows of a `compassCaptureScript` and the constant direction of the capture window. */
export interface CompassCaptureScenario {
  readonly script: import('../simulator/simulator-script').SimulatorScript;
  readonly yawStartUtcMs: number;
  readonly yawEndUtcMs: number;
  readonly captureStartUtcMs: number;
  readonly captureEndUtcMs: number;
  readonly minSampleCount: number;
  /** The true azimuth of the constant direction `D` over the capture window. */
  readonly captureAzimuthRad: number;
  readonly declinationSigmaRad: number;
}

const SCRIPT_START_UTC_MS = 1_790_000_000_000;

/**
 * `compassCaptureScript` (P-12.7, Req 12.7): a noise-free Relative-frame script with a heading (no
 * bias, noise or jumps), Screen angle 0, no altitude bias and a Declination in [-π, π] (ends
 * drawn), with two windows on its timeline:
 * - an event interval in [5, 100] ms; the Yaw reference window `[Ty0, Ty1]` starts 0 to 20 events
 *   after the script's start, and it and the capture window `[Tc0, Tc1]` each last 10 to 100
 *   events, with a gap `Tc0 − Ty1` of 0 to 5000 ms rounded up to an event; every window end lies on
 *   an event, so the newest sample of each window is never stale;
 * - 0 to 3 resets, each with a new zero in [0, 2π), placed only before `Ty0` or in
 *   `(Tc1, Tc1 + 5000]`: none lies in `[Ty0, Tc1]`, which covers both windows and the span between
 *   them, as Req 12.7 requires. Resets before `Ty0` change the zero that the reference then
 *   measures; resets after `Tc1` are delivered but read by neither window;
 * - 1 to 4 moving keyframes in `[start, Ty1)`, so the direction may move during the Yaw reference
 *   window; then two keyframes with the same direction `D`, at `a ∈ [Ty1, Tc0]` (after the last
 *   moving one) and `b ∈ [Tc1, Tc1 + 5000]`, so the direction is constant over the capture window;
 *   and in one draw of two a further moving keyframe after `b`. Pose altitudes in [-30°, 30°] (ends
 *   drawn), rolls in [-π, π).
 * The property applies `fc.pre` to the computed Camera altitudes of the samples both windows read.
 */
export function compassCaptureScript(): fc.Arbitrary<CompassCaptureScenario> {
  const limit = 30 * DEG;
  const poseAngles = fc.record({
    azimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: closed(-limit, limit),
    rollRad: halfOpen(-Math.PI, Math.PI),
  });
  return fc
    .record({
      intervalMs: uniformInteger(5, 100),
      yawStartEvents: uniformInteger(0, 20),
      yawEvents: uniformInteger(10, 100),
      gapMs: uniformInteger(0, 5000),
      captureEvents: uniformInteger(10, 100),
      zeroRad: halfOpen(0, TWO_PI),
      declinationRad: closed(-Math.PI, Math.PI),
      declinationSigmaRad: closed(0.26 * DEG, 2.72 * DEG),
      minSampleCount: uniformInteger(1, 10),
      moving: fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), poseAngles), {
        minLength: 1,
        maxLength: 4,
      }),
      constant: poseAngles,
      constantStartFraction: fc.double({ min: 0, max: 1, noNaN: true }),
      constantEndMs: uniformInteger(0, 5000),
      after: fc.option(fc.tuple(uniformInteger(1, 5000), poseAngles), { nil: undefined }),
      resets: fc.array(
        fc.record({
          before: fc.boolean(),
          fraction: fc.double({ min: 0, max: 1, noNaN: true }),
          cause: fc.constantFrom(
            'hidden' as const,
            'blur' as const,
            'pagehide' as const,
            'restart' as const,
            'frame_change' as const,
          ),
          newZeroRad: halfOpen(0, TWO_PI),
        }),
        { maxLength: 3 },
      ),
    })
    .map((d) => {
      const start = SCRIPT_START_UTC_MS;
      const yawStart = start + d.yawStartEvents * d.intervalMs;
      const yawEnd = yawStart + d.yawEvents * d.intervalMs;
      const captureStart =
        start + Math.ceil((yawEnd + d.gapMs - start) / d.intervalMs) * d.intervalMs;
      const captureEnd = captureStart + d.captureEvents * d.intervalMs;

      // Moving keyframes at distinct times in [start, yawEnd), then D at a ∈ [yawEnd, captureStart]
      // (after the last moving one) and at b ≥ captureEnd: D is constant over [captureStart, captureEnd].
      const movingTimes = [
        ...new Set(d.moving.map(([f]) => Math.floor(start + f * (yawEnd - 1 - start)))),
      ].sort((x, y) => x - y);
      const lastMoving = movingTimes[movingTimes.length - 1] ?? start;
      const a = Math.min(
        captureStart,
        Math.max(
          lastMoving + 1,
          Math.floor(yawEnd + d.constantStartFraction * (captureStart - yawEnd)),
        ),
      );
      const b = captureEnd + d.constantEndMs;
      const pose = [
        ...movingTimes.map((timeUtcMs, i) => ({ timeUtcMs, ...(d.moving[i]?.[1] ?? d.constant) })),
        { timeUtcMs: a, ...d.constant },
        { timeUtcMs: b, ...d.constant },
      ];
      const lastPose = pose[pose.length - 1];
      if (d.after !== undefined && lastPose !== undefined) {
        pose.push({ timeUtcMs: lastPose.timeUtcMs + d.after[0], ...d.after[1] });
      }

      const resets = d.resets.map((r) => ({
        timeUtcMs: r.before
          ? Math.floor(start + r.fraction * (yawStart - start - 1))
          : captureEnd + 1 + Math.floor(r.fraction * 4999),
        cause: r.cause,
        newZeroRad: r.newZeroRad,
      }));
      return {
        script: {
          startUtcMs: start,
          eventIntervalMs: d.intervalMs,
          pose,
          orientationNoiseSigmaRad: 0,
          altitudeBiasRad: 0,
          frame: {
            kind: 'relative' as const,
            zeroRad: d.zeroRad,
            resets: resets.filter((r) => r.timeUtcMs < yawStart || r.timeUtcMs > captureEnd),
          },
          heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
          screenAngleDeg: 0,
          declinationRad: d.declinationRad,
          position: null,
          orientation: 'available' as const,
          orientationPermission: 'not_required' as const,
          secureContext: true,
        },
        yawStartUtcMs: yawStart,
        yawEndUtcMs: yawEnd,
        captureStartUtcMs: captureStart,
        captureEndUtcMs: captureEnd,
        minSampleCount: d.minSampleCount,
        captureAzimuthRad: d.constant.azimuthRad,
        declinationSigmaRad: d.declinationSigmaRad,
      };
    });
}

/**
 * `simulatorScript` (P-12.8): valid scripts over every field of the script — an event interval in
 * [5, 100] ms, 1 to 5 keyframes in the first 20 s with altitudes in [-80°, 80°], both frames with 0
 * to 3 resets, a heading present or not (with 0 to 2 jumps), each Screen angle kind, a Declination
 * in [-π, π], a fix, a failure or no position, a missing orientation sensor in one draw of ten,
 * each permission kind, and an insecure page in one draw of ten. In the `noiseFree` variant every
 * noise, bias, jump and frame error is zero. Excludes invalid scripts, which the examples cover.
 */
export function simulatorScript(
  noiseFree = false,
): fc.Arbitrary<import('../simulator/simulator-script').SimulatorScript> {
  const start = SCRIPT_START_UTC_MS;
  const small = (maxDeg: number) =>
    noiseFree ? fc.constant(0) : closed(-maxDeg * DEG, maxDeg * DEG);
  const sigma = (maxDeg: number) => (noiseFree ? fc.constant(0) : closed(0, maxDeg * DEG));
  const keyframe = fc.record({
    offsetMs: uniformInteger(0, 20_000),
    azimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: closed(-80 * DEG, 80 * DEG),
    rollRad: halfOpen(-Math.PI, Math.PI),
  });
  const frame = fc.oneof(
    fc.record({
      kind: fc.constant('absolute' as const),
      northErrorRad: small(5),
      resets: fc.array(
        fc.record({
          timeUtcMs: uniformInteger(start, start + 30_000),
          cause: fc.constantFrom('hidden' as const, 'blur' as const, 'pagehide' as const),
        }),
        { maxLength: 3 },
      ),
    }),
    fc.record({
      kind: fc.constant('relative' as const),
      zeroRad: halfOpen(0, TWO_PI),
      resets: fc.array(
        fc.record({
          timeUtcMs: uniformInteger(start, start + 30_000),
          cause: fc.constantFrom(
            'hidden' as const,
            'blur' as const,
            'pagehide' as const,
            'restart' as const,
            'frame_change' as const,
          ),
          newZeroRad: halfOpen(0, TWO_PI),
        }),
        { maxLength: 3 },
      ),
    }),
  );
  const heading = fc.option(
    fc.record({
      biasRad: small(5),
      noiseSigmaRad: sigma(2),
      jumps: noiseFree
        ? fc.constant([])
        : fc.array(
            fc.record({
              startUtcMs: uniformInteger(start, start + 30_000),
              durationMs: uniformInteger(0, 5000),
              sizeRad: closed(-4 * DEG, 4 * DEG),
            }),
            { maxLength: 2 },
          ),
      reportedAccuracyDeg: fc.constantFrom(10, -1, 25),
    }),
    { nil: null },
  );
  const position = fc.oneof(
    fc.constant(null),
    fc.record({
      kind: fc.constant('fix' as const),
      position: fc.record({
        latRad: closed(-89 * DEG, 89 * DEG),
        lonRad: uniform(-Math.PI, Math.PI).map((x) => (x === -Math.PI ? Math.PI : x)),
      }),
      reportedAccuracyM: closed(0, 3000),
      firstFixDelayMs: uniformInteger(0, 40_000),
      fixIntervalMs: uniformInteger(1, 5000),
    }),
    fc.record({
      kind: fc.constant('failure' as const),
      reason: fc.constantFrom(
        'permission_denied' as const,
        'position_unavailable' as const,
        'position_timeout' as const,
      ),
    }),
  );
  return fc
    .record({
      eventIntervalMs: uniformInteger(5, 100),
      keyframes: fc.array(keyframe, { minLength: 1, maxLength: 5 }),
      orientationNoiseSigmaRad: sigma(1),
      altitudeBiasRad: small(5),
      frame,
      heading,
      screenAngleDeg: fc.constantFrom(0, 90, null),
      declinationRad: closed(-Math.PI, Math.PI),
      position,
      orientation: fc.oneof(
        { weight: 9, arbitrary: fc.constant('available' as const) },
        { weight: 1, arbitrary: fc.constant('missing' as const) },
      ),
      orientationPermission: fc.constantFrom(
        'not_required' as const,
        'granted' as const,
        'denied' as const,
      ),
      secureContext: fc.oneof(
        { weight: 9, arbitrary: fc.constant(true) },
        { weight: 1, arbitrary: fc.constant(false) },
      ),
    })
    .map((d) => {
      const times = [...new Set(d.keyframes.map((k) => start + k.offsetMs))].sort((x, y) => x - y);
      const pose = times.map((timeUtcMs, i) => {
        const k = d.keyframes[i] ?? d.keyframes[0];
        return {
          timeUtcMs,
          azimuthRad: k?.azimuthRad ?? 0,
          apparentAltitudeRad: k?.apparentAltitudeRad ?? 0,
          rollRad: k?.rollRad ?? 0,
        };
      });
      return {
        startUtcMs: start,
        eventIntervalMs: d.eventIntervalMs,
        pose,
        orientationNoiseSigmaRad: d.orientationNoiseSigmaRad,
        altitudeBiasRad: d.altitudeBiasRad,
        frame: d.frame,
        heading: d.heading,
        screenAngleDeg: d.screenAngleDeg,
        declinationRad: d.declinationRad,
        position: d.position,
        orientation: d.orientation,
        orientationPermission: d.orientationPermission,
        secureContext: d.secureContext,
      };
    });
}
