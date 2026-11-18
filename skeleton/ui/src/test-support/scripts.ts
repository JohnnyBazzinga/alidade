// Simulator scripts for the UI's properties (test support, not exported). A copy of the domains of
// Sensors' `simulatorScript` generator, because Sensors' test support is not exported across
// packages (design §8). Each documents the domain it draws from and what it excludes.

import type { SimulatorScript } from '@alidade/sensors';
import fc from 'fast-check';
import { closed, uniform, uniformInteger } from './generators';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

/** 2026-09-21: inside the WMM2025 validity window (design D16). */
export const SCRIPT_START_UTC_MS = 1_790_000_000_000;

/**
 * `simulatorScript`: valid scripts over every field of the script: an event interval in
 * [5, 100] ms, 1 to 5 keyframes in the first 20 s with altitudes in [-80°, 80°], both frames with
 * 0 to 3 resets, a heading present or not (with 0 to 2 jumps), a Screen angle of 0, 90° or
 * `null`, a Declination in [-π, π], a fix, a failure or no position, a missing orientation
 * sensor in one draw of ten, each permission kind, and an insecure page in one draw of ten.
 * With `noiseFree`, every noise, bias, jump and frame error is zero. Excludes invalid scripts.
 */
export function simulatorScript(noiseFree = false): fc.Arbitrary<SimulatorScript> {
  const start = SCRIPT_START_UTC_MS;
  const small = (maxDeg: number) =>
    noiseFree ? fc.constant(0) : closed(-maxDeg * DEG, maxDeg * DEG);
  const sigma = (maxDeg: number) => (noiseFree ? fc.constant(0) : closed(0, maxDeg * DEG));
  const keyframe = fc.record({
    offsetMs: uniformInteger(0, 20_000),
    azimuthRad: uniform(0, TWO_PI),
    apparentAltitudeRad: closed(-80 * DEG, 80 * DEG),
    rollRad: uniform(-Math.PI, Math.PI),
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
      zeroRad: uniform(0, TWO_PI),
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
          newZeroRad: uniform(0, TWO_PI),
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
