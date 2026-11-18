import { wrapPi } from '@alidade/core';
import { declinationAt, type SimulatorScript } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed, layoutCase, uniform, uniformInteger } from '../../test-support/generators';
import { buildHistoryFromRun } from '../../test-support/history-from-script';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { simulatedPose } from '../../test-support/scene-generators';
import { PARAMETERS, sessionFromHistory } from '../../test-support/session-fixtures';
import { SCRIPT_START_UTC_MS } from '../../test-support/scripts';
import { pointToRayOffset } from '../image-geometry';
import { step } from '../session/step';
import { sceneFromOffsets, type TargetSpec } from './scene-from-offsets';
import { projectScene } from './project-scene';
import { targetDirection } from './target-direction';

const DEG = Math.PI / 180;
/** P-16.8 runs a whole Simulator and Session per case: 1.5 ms (checkpoint 20). */
const END_TO_END_RUNS = 10_000;

/**
 * Domain (P-16.8): an origin at latitude [-60°, 60°], any longitude; two Stations and 1 to 4
 * landmarks within ±14 km (heights in [-500, 2000] m), or a Sun (azimuth [0, 2π), altitude
 * [-75°, 75°]); one Target chosen as the one to sight; a camera aimed near it (azimuth and altitude
 * offsets in ±25°, the altitude limited to ±80°; roll in [-π, π)); a `layoutCase` whose calibration
 * is the scene's; a noise-free script in the Absolute frame, or in the Relative frame with a
 * compass whose heading includes the scripted Declination, the Yaw reference set from the compass
 * (the compass needs the camera within 30° of level, so Relative cases aim within ±30°); a bearing
 * or an altitude Session. Discarded: Targets that are not visible (outside the Element, on a
 * `contain` bar, behind, or beyond 80°: Req 16.3), Targets steeper than ±80° (no azimuth for a
 * Mark), and captures Sensors refuses (each counted).
 */
const endToEndCase = fc.record({
  lat: closed(-60 * DEG, 60 * DEG),
  lon: uniform(-Math.PI, Math.PI),
  landmarks: fc.array(
    fc.record({
      eastM: closed(-14_000, 14_000),
      northM: closed(-14_000, 14_000),
      heightM: closed(-500, 2000),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  sun: fc.option(
    fc.record({
      azimuthRad: uniform(0, 2 * Math.PI),
      apparentAltitudeRad: closed(-75 * DEG, 75 * DEG),
    }),
    { freq: 3 },
  ),
  targetIndex: uniformInteger(0, 4),
  dAz: closed(-25 * DEG, 25 * DEG),
  dAlt: closed(-25 * DEG, 25 * DEG),
  roll: uniform(-Math.PI, Math.PI),
  layout: layoutCase(),
  frame: fc.constantFrom('absolute' as const, 'relative' as const),
  kind: fc.constantFrom('bearing' as const, 'altitude' as const),
  zeroRad: uniform(0, 2 * Math.PI),
  seed: uniformInteger(0, 2 ** 32 - 1),
});

// P-16.8 (Req 16.8): the Session, run on a noise-free Simulator through freeze, a Mark at the
// Target's Pixel point in the Scene image, and capture, gives the Target's true azimuth within
// 1e-8 rad (wrapped) for a bearing Session, and its apparent altitude within 1e-8 rad for an
// altitude Session. This is the property that tapping a landmark gives its true direction.
describe('P-16.8 tapping a Target gives its true direction', () => {
  it('captures the true azimuth or altitude of the marked Target', () => {
    const tracker = new ErrorTracker();
    const outcomes = new Map<string, number>();
    let offCentre = 0;
    let checked = 0;
    const count = (key: string) => outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    checkProperty(
      'P-16.8',
      fc.property(endToEndCase, (c) => {
        const targets: TargetSpec[] = c.landmarks.map((l, i) => ({
          kind: 'landmark',
          id: `t${i}`,
          label: `T${i}`,
          ...l,
        }));
        if (c.sun !== null)
          targets.push({
            kind: 'sun',
            id: 'sun',
            label: 'Sun',
            angularRadiusRad: 0.27 * DEG,
            ...c.sun,
          });
        const built = sceneFromOffsets({
          id: 'e2e',
          name: 'E2E',
          origin: { latRad: c.lat, lonRad: c.lon },
          calibration: c.layout.calibration,
          stations: [
            { id: 'a', name: 'A', eastM: 0, northM: 0 },
            { id: 'b', name: 'B', eastM: 900, northM: 300 },
          ],
          targets,
        });
        fc.pre(built.ok);
        if (!built.ok) return false;
        const scene = built.value;
        const station = scene.stations[0];
        const target = scene.targets[c.targetIndex % scene.targets.length];
        if (station === undefined || target === undefined) return false;
        const direction = targetDirection(station, target);
        fc.pre(direction.ok);
        if (!direction.ok) return false;
        const truth = direction.value;
        if (Math.abs(truth.apparentAltitudeRad) > 79 * DEG) {
          count('discard: Target steeper than 79°');
          fc.pre(false);
        }
        // The standing rule for limits: Sensors' compass refuses a camera above 30°, and a pose limited
        // to exactly 30° can land an ulp beyond it, so Relative cases stop 1e-6 rad inside it.
        const limit = c.frame === 'relative' ? 30 * DEG - 1e-6 : 80 * DEG;
        const pose = {
          azimuthRad: truth.azimuthRad + c.dAz,
          apparentAltitudeRad: Math.max(
            -limit,
            Math.min(limit, truth.apparentAltitudeRad + c.dAlt),
          ),
          rollRad: c.roll,
        };
        const { trueRotation } = simulatedPose(pose);
        const projected = projectScene(scene, station, trueRotation, c.layout.layout);
        if (!projected.ok) return false;
        const shown = projected.value.targets[c.targetIndex % scene.targets.length];
        if (shown === undefined || !shown.visible || shown.point === null) {
          count('discard: Target not visible');
          fc.pre(false);
          return false;
        }
        const declination = declinationAt(station.position, SCRIPT_START_UTC_MS);
        fc.pre(declination.ok);
        if (!declination.ok) return false;
        const script: SimulatorScript = {
          startUtcMs: SCRIPT_START_UTC_MS,
          eventIntervalMs: 50,
          pose: [{ timeUtcMs: SCRIPT_START_UTC_MS, ...pose }],
          orientationNoiseSigmaRad: 0,
          altitudeBiasRad: 0,
          frame:
            c.frame === 'absolute'
              ? { kind: 'absolute', northErrorRad: 0, resets: [] }
              : { kind: 'relative', zeroRad: c.zeroRad, resets: [] },
          heading:
            c.frame === 'relative'
              ? { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 }
              : null,
          screenAngleDeg: 0,
          declinationRad: declination.value.declinationRad,
          position: {
            kind: 'fix',
            position: station.position,
            reportedAccuracyM: 5,
            firstFixDelayMs: 0,
            fixIntervalMs: 1000,
          },
          orientation: 'available',
          orientationPermission: 'not_required',
          secureContext: true,
        };
        const history = buildHistoryFromRun({
          script,
          seed: c.seed,
          steps: [{ aim: null, advanceToUtcMs: SCRIPT_START_UTC_MS + 1500 }],
        });
        let session = sessionFromHistory(
          c.kind,
          history,
          SCRIPT_START_UTC_MS,
          PARAMETERS,
          c.kind === 'bearing' ? declination.value : null,
        );
        const at = history.endUtcMs;
        if (c.frame === 'relative')
          session = step(
            session,
            { kind: 'establishYaw', timeUtcMs: at, from: { kind: 'compass' } },
            PARAMETERS,
          ).session;
        session = step(session, { kind: 'freeze', timeUtcMs: at }, PARAMETERS).session;
        session = step(
          session,
          {
            kind: 'mark',
            timeUtcMs: at,
            point: shown.point,
            layout: c.layout.layout,
            calibration: scene.calibration,
            tapSigmaPx: 0,
          },
          PARAMETERS,
        ).session;
        const mark = session.frozen?.mark;
        if (mark == null) {
          // The tap on the Target's own pixel can be refused only at the 80° limit.
          count(`discard: mark refused (${session.notice?.reason})`);
          fc.pre(false);
          return false;
        }
        session = step(session, { kind: 'capture', timeUtcMs: at }, PARAMETERS).session;
        const captured = session.captured;
        if (captured === null) {
          count(`discard: capture refused (${session.notice?.reason})`);
          fc.pre(false);
          return false;
        }
        const offset = pointToRayOffset(c.layout.layout, scene.calibration, shown.point);
        if (
          offset.ok &&
          Math.acos(Math.cos(offset.value.rightRad) * Math.cos(offset.value.upRad)) > 10 * DEG
        )
          offCentre += 1;
        checked += 1;
        count(`${c.kind} ${c.frame}`);
        let error: number;
        if (captured.kind === 'bearing') {
          const d = wrapPi(captured.bearing.azimuthRad - truth.azimuthRad);
          error = d.ok ? Math.abs(d.value) : Infinity;
          tracker.record(
            'bearing azimuth error [rad]',
            error,
            '1e-8',
            `F=${c.layout.focalPx.toPrecision(3)}`,
          );
        } else {
          error = Math.abs(captured.altitude.apparentAltitudeRad - truth.apparentAltitudeRad);
          tracker.record(
            'altitude error [rad]',
            error,
            '1e-8',
            `F=${c.layout.focalPx.toPrecision(3)}`,
          );
        }
        return error <= 1e-8;
      }),
      tracker,
      { numRuns: cappedRuns(END_TO_END_RUNS) },
    );
    console.log(
      `[coverage] P-16.8: ${checked} captures checked, ${offCentre} with the Mark more than 10° from the centre; ${JSON.stringify(Object.fromEntries([...outcomes].sort()))}`,
    );
    expect(checked).toBeGreaterThan(0);
  });
});
