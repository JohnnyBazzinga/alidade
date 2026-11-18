import {
  MAX_RAY_OFFSET_RAD,
  offAxisRay,
  rayOffsetOfDirection,
  type EnuDirection,
} from '@alidade/sensors';
import { wrapPi } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns, propertyRuns } from '../../test-support/fast-check-setup';
import { closed } from '../../test-support/generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { dragCase, sceneCase, simulatedPose } from '../../test-support/scene-generators';
import { offsetOfPixel } from '../image-geometry';
import { aimAfterDrag, MAX_AIM_ALTITUDE_RAD } from './aim';
import { enuOf, projectScene } from './project-scene';
import { targetDirection } from './target-direction';

const RUNS = 10_000;

function angleBetween(a: EnuDirection, b: EnuDirection): number {
  const cx = a.north * b.up - a.up * b.north;
  const cy = a.up * b.east - a.east * b.up;
  const cz = a.east * b.north - a.north * b.east;
  return Math.atan2(Math.hypot(cx, cy, cz), a.east * b.east + a.north * b.north + a.up * b.up);
}

// P-16.7 (Req 16.7): for every visible Target, the Pixel point that `projectScene` reports, taken
// back through the geometry of Req 5.2 and Sensors' Off-axis ray at the rotation of the
// Orientation sample a noise-free Simulator delivers for the pose, gives the Target's true
// direction within 1e-9 rad. Domain: `sceneCase`. The standing rule for limits: Sensors'
// `offAxisRay` refuses an offset beyond 80°, and the round trip of a Target exactly at 80° can
// land an ulp beyond it, so Targets whose offset is within 1e-6 rad of 80° are skipped for this
// check (counted; the exact limit has an example test).
describe('P-16.7 the Scene image puts each Target where the sensor sees it', () => {
  it('gives back the true direction of every visible Target', () => {
    const tracker = new ErrorTracker();
    let visible = 0;
    let nearLimit = 0;
    checkProperty(
      'P-16.7',
      fc.property(sceneCase(), (c) => {
        const station = c.scene.stations[c.stationIndex];
        if (station === undefined) return false;
        const { trueRotation, sample } = simulatedPose(c.pose);
        const projected = projectScene(c.scene, station, trueRotation, c.layout.layout);
        if (!projected.ok) return false;
        let worst = 0;
        for (const [i, t] of projected.value.targets.entries()) {
          if (!t.visible || t.point === null) continue;
          const target = c.scene.targets[i];
          if (target === undefined) return false;
          const d = targetDirection(station, target);
          if (!d.ok) return false;
          const direction = enuOf(d.value.azimuthRad, d.value.apparentAltitudeRad);
          const exact = rayOffsetOfDirection(trueRotation, direction);
          if (!exact.ok || exact.value === null) return false;
          if (
            Math.max(Math.abs(exact.value.rightRad), Math.abs(exact.value.upRad)) >
            MAX_RAY_OFFSET_RAD - 1e-6
          ) {
            nearLimit += 1;
            continue;
          }
          visible += 1;
          const offset = offsetOfPixel(c.layout.layout, projected.value.focalPx, t.point);
          const ray = offAxisRay(sample.rotation, offset);
          if (!ray.ok) return false;
          worst = Math.max(worst, angleBetween(ray.value, direction));
        }
        tracker.record(
          'angle to the true direction [rad]',
          worst,
          '1e-9',
          `F=${c.layout.focalPx.toPrecision(3)}`,
        );
        return worst <= 1e-9;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    console.log(
      `[coverage] P-16.7: ${visible} visible Targets checked, ${nearLimit} within 1e-6 rad of 80° skipped`,
    );
    expect(visible).toBeGreaterThan(0);
  });
});

/** Distance of a point from the infinite line through a and b. */
function distanceToLine(
  p: { xPx: number; yPx: number },
  a: { xPx: number; yPx: number },
  b: { xPx: number; yPx: number },
): number {
  const dx = b.xPx - a.xPx;
  const dy = b.yPx - a.yPx;
  return Math.abs(dx * (p.yPx - a.yPx) - dy * (p.xPx - a.xPx)) / Math.hypot(dx, dy);
}

// P-16.9 (Req 16.9, 16.3): every landmark at height 0 (on the horizon) that `projectScene` reports
// visible (inside the Element and on the image) lies within 1e-6 CSS px of the horizon line it
// returns; a Target behind the camera is
// never visible; the line is `null` only when no such landmark is visible. Domain: `sceneCase`
// with flat landmarks. The standing rule for limits: at a camera altitude of exactly ±80° the
// whole horizon lies at an offset of exactly 80°, and the two directions the horizon is built
// from land an ulp beyond it, so the pose's altitude is drawn at least 1e-6 rad inside ±80°
// (the exact limit has an example test, in scene.test.ts).
describe('P-16.9 the horizon', () => {
  it('passes through every visible point of the horizon', () => {
    const tracker = new ErrorTracker();
    let onLine = 0;
    let steepWithHorizon = 0;
    let steep = 0;
    checkProperty(
      'P-16.9',
      fc.property(sceneCase(true, MAX_AIM_ALTITUDE_RAD - 1e-6), (c) => {
        const station = c.scene.stations[c.stationIndex];
        if (station === undefined) return false;
        const { trueRotation } = simulatedPose(c.pose);
        const projected = projectScene(c.scene, station, trueRotation, c.layout.layout);
        if (!projected.ok) return false;
        const horizon = projected.value.horizon;
        if (Math.abs(c.pose.apparentAltitudeRad) > (75 * Math.PI) / 180) {
          steep += 1;
          if (horizon !== null) steepWithHorizon += 1;
        }
        let worst = 0;
        let bad = 0;
        for (const [i, t] of projected.value.targets.entries()) {
          const target = c.scene.targets[i];
          if (target === undefined) return false;
          const d = targetDirection(station, target);
          if (!d.ok) return false;
          const behind = rayOffsetOfDirection(
            trueRotation,
            enuOf(d.value.azimuthRad, d.value.apparentAltitudeRad),
          );
          if (behind.ok && behind.value === null && t.visible) bad += 1;
          if (!t.visible || t.point === null) continue;
          if (horizon === null) {
            bad += 1;
            continue;
          }
          onLine += 1;
          worst = Math.max(worst, distanceToLine(t.point, horizon.a, horizon.b));
        }
        tracker.record(
          'distance from the horizon line [px]',
          worst,
          '1e-6',
          `F=${c.layout.focalPx.toPrecision(3)}`,
        );
        tracker.record('visible behind or with no horizon (must be 0)', bad, '0');
        return worst <= 1e-6 && bad === 0;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    console.log(
      `[coverage] P-16.9: ${onLine} visible horizon points checked; ${steep} cases beyond 75° of altitude, ${steepWithHorizon} of them with a horizon in view`,
    );
    expect(onLine).toBeGreaterThan(0);
  });
});

// P-16.10 (Req 16.10): the true direction of any Target from any Station at least 1 m away is
// finite, with an azimuth in [0, 2π) and an altitude in [-π/2, π/2]. Domain: `sceneCase`, and
// Suns with any finite azimuth in [-1e6, 1e6] rad and altitude in [-π/2, π/2].
describe('P-16.10 true directions are well formed', () => {
  it('is finite and in range', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-16.10',
      fc.property(
        sceneCase(),
        closed(-1e6, 1e6),
        closed(-Math.PI / 2, Math.PI / 2),
        (c, az, alt) => {
          let bad = 0;
          for (const station of c.scene.stations) {
            for (const target of [
              ...c.scene.targets,
              {
                kind: 'sun' as const,
                id: 'x',
                label: 'X',
                azimuthRad: az,
                apparentAltitudeRad: alt,
                angularRadiusRad: 0.004,
              },
            ]) {
              const d = targetDirection(station, target);
              if (!d.ok) {
                if (d.reason !== 'coincident_positions') bad += 1;
                continue;
              }
              const { azimuthRad, apparentAltitudeRad } = d.value;
              if (!(
                azimuthRad >= 0 &&
                azimuthRad < 2 * Math.PI &&
                Math.abs(apparentAltitudeRad) <= Math.PI / 2
              ))
                bad += 1;
            }
          }
          tracker.record('directions out of range (must be 0)', bad, '0');
          return bad === 0;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

// P-17.12 (Req 17.12): `aimAfterDrag` returns a finite pose with the azimuth in [0, 2π), the
// altitude in [-80°, 80°] and the roll unchanged; a zero drag returns the pose within 1e-12; a
// horizontal drag and its opposite return the azimuth within 1e-9 (wrapped); any drag and its
// opposite return the altitude within 1e-9 when neither step reached the limit. Domain: `dragCase`.
describe('P-17.12 dragging to aim', () => {
  it('stays in range and is undone by the opposite drag', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-17.12',
      fc.property(dragCase(), ({ pose, dxPx, dyPx, focalPx }) => {
        const once = aimAfterDrag(pose, dxPx, dyPx, focalPx);
        const zero = aimAfterDrag(pose, 0, 0, focalPx);
        const horizontal = aimAfterDrag(pose, dxPx, 0, focalPx);
        if (!once.ok || !zero.ok || !horizontal.ok) return false;
        const back = aimAfterDrag(once.value, -dxPx, -dyPx, focalPx);
        const backHorizontal = aimAfterDrag(horizontal.value, -dxPx, 0, focalPx);
        if (!back.ok || !backHorizontal.ok) return false;
        const p = once.value;
        const inRange =
          p.azimuthRad >= 0 &&
          p.azimuthRad < 2 * Math.PI &&
          Math.abs(p.apparentAltitudeRad) <= MAX_AIM_ALTITUDE_RAD &&
          p.rollRad === pose.rollRad;
        const w = (x: number) => {
          const r = wrapPi(x);
          return r.ok ? Math.abs(r.value) : Infinity;
        };
        const zeroError = Math.max(
          w(zero.value.azimuthRad - pose.azimuthRad),
          Math.abs(zero.value.apparentAltitudeRad - pose.apparentAltitudeRad),
        );
        const azimuthBack = w(backHorizontal.value.azimuthRad - pose.azimuthRad);
        const limited =
          Math.abs(p.apparentAltitudeRad) >= MAX_AIM_ALTITUDE_RAD ||
          Math.abs(back.value.apparentAltitudeRad) >= MAX_AIM_ALTITUDE_RAD;
        const altitudeBack = limited
          ? 0
          : Math.abs(back.value.apparentAltitudeRad - pose.apparentAltitudeRad);
        tracker.record('zero drag error [rad]', zeroError, '1e-12');
        tracker.record('horizontal drag undone, azimuth [rad]', azimuthBack, '1e-9');
        tracker.record('drag undone, altitude [rad]', altitudeBack, '1e-9');
        return inRange && zeroError <= 1e-12 && azimuthBack <= 1e-9 && altitudeBack <= 1e-9;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
