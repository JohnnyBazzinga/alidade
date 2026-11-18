import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import { imageLayout } from '../image-layout';
import { rotationOfPose } from '../../test-support/pose-rotation';
import { aimAfterDrag } from './aim';
import {
  CATALOGUE_CALIBRATION,
  CATALOGUE_ORIGIN,
  sceneFromOffsets,
  type TargetSpec,
} from './catalogue';
import {
  clipLine,
  horizonByFoot,
  horizonByPair,
  HORIZON_FOOT_FROM_RAD,
  projectScene,
} from './project-scene';
import { checkScene, type SyntheticScene } from './scene';
import { targetDirection } from './target-direction';

function scene(
  targets: readonly TargetSpec[] = [
    { kind: 'landmark', id: 'east', label: 'East', eastM: 1000, northM: 0, heightM: 100 },
  ],
): SyntheticScene {
  const built = sceneFromOffsets({
    id: 's',
    name: 'Test',
    origin: CATALOGUE_ORIGIN,
    calibration: CATALOGUE_CALIBRATION,
    stations: [
      { id: 'a', name: 'A', eastM: 0, northM: 0 },
      { id: 'b', name: 'B', eastM: 500, northM: 0 },
    ],
    targets,
  });
  if (!built.ok) throw new Error(built.reason);
  return built.value;
}

function layout(fit: 'cover' | 'contain' = 'cover') {
  const l = imageLayout(
    { widthSourcePx: 720, heightSourcePx: 1280 },
    { widthPx: 390, heightPx: 844 },
    fit,
  );
  if (!l.ok) throw new Error('layout');
  return l.value;
}

function first<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error('empty');
  return x;
}

describe('targetDirection (Req 16.2, 16.11)', () => {
  it('a landmark 1000 m due east and 100 m high: azimuth π/2 within 1e-9, altitude atan(0.1) within 1e-12', () => {
    const s = scene();
    const d = targetDirection(first(s.stations), first(s.targets));
    if (!d.ok) throw new Error(d.reason);
    expect(Math.abs(d.value.azimuthRad - Math.PI / 2)).toBeLessThan(1e-9);
    expect(Math.abs(d.value.apparentAltitudeRad - Math.atan(0.1))).toBeLessThan(1e-12);
  });

  it('refuses a Target under 1 m away with coincident_positions', () => {
    const s = scene([
      { kind: 'landmark', id: 'near', label: 'Near', eastM: 0.5, northM: 0, heightM: 0 },
    ]);
    expect(targetDirection(first(s.stations), first(s.targets))).toEqual({
      ok: false,
      reason: 'coincident_positions',
      id: 'near',
    });
  });

  it('gives the Sun its own direction, wrapped', () => {
    const d = targetDirection(first(scene().stations), {
      kind: 'sun',
      id: 'sun',
      label: 'Sun',
      azimuthRad: -1,
      apparentAltitudeRad: 0.5,
      angularRadiusRad: 0.005,
    });
    expect(
      d.ok &&
        Math.abs(d.value.azimuthRad - (2 * Math.PI - 1)) < 1e-15 &&
        d.value.apparentAltitudeRad === 0.5,
    ).toBe(true);
  });
});

describe('checkScene (Req 16.1)', () => {
  const good = scene();
  const a = first(good.stations);
  it('accepts a valid scene', () => expect(checkScene(good).ok).toBe(true));
  it('names each invalid field', () => {
    const cases: [Partial<SyntheticScene>, unknown][] = [
      [{ id: '' }, { ok: false, reason: 'invalid_number', field: 'id' }],
      [{ name: ' ' }, { ok: false, reason: 'invalid_number', field: 'name' }],
      [
        { calibration: { ...CATALOGUE_CALIBRATION, fovRad: 0 } },
        { ok: false, reason: 'invalid_number', field: 'fovRad' },
      ],
      [{ stations: [a] }, { ok: false, reason: 'invalid_number', field: 'stations' }],
      [
        { stations: [a, a] },
        { ok: false, reason: 'invalid_number', field: 'stations.id', id: 'a' },
      ],
      [
        { stations: [a, { id: 'p', name: 'Pole', position: { latRad: 1.57, lonRad: 0 } }] },
        { ok: false, reason: 'unsupported_position', id: 'p' },
      ],
      [
        {
          targets: [
            {
              kind: 'landmark',
              id: 't',
              label: 'T',
              position: CATALOGUE_ORIGIN,
              heightM: Number.NaN,
            },
          ],
        },
        { ok: false, reason: 'invalid_number', field: 'heightM', id: 't' },
      ],
      [
        {
          targets: [
            {
              kind: 'sun',
              id: 'sun',
              label: 'Sun',
              azimuthRad: 1,
              apparentAltitudeRad: fromDeg(81),
              angularRadiusRad: 0.004,
            },
          ],
        },
        { ok: false, reason: 'invalid_number', field: 'apparentAltitudeRad', id: 'sun' },
      ],
      [
        {
          targets: [
            {
              kind: 'sun',
              id: 'sun',
              label: 'Sun',
              azimuthRad: 1,
              apparentAltitudeRad: 0.3,
              angularRadiusRad: 0,
            },
          ],
        },
        { ok: false, reason: 'invalid_number', field: 'angularRadiusRad', id: 'sun' },
      ],
    ];
    for (const [patch, expected] of cases)
      expect(checkScene({ ...good, ...patch })).toEqual(expected);
  });
});

describe('projectScene (Req 16.3, 16.4)', () => {
  const s = scene([
    { kind: 'landmark', id: 'east', label: 'East', eastM: 1000, northM: 0, heightM: 0 },
    { kind: 'landmark', id: 'west', label: 'West', eastM: -1000, northM: 0, heightM: 0 },
  ]);
  const station = first(s.stations);
  const east = targetDirection(station, first(s.targets));
  if (!east.ok) throw new Error('direction');

  it('puts a Target on the axis at the centre, and a Target behind the camera out of view', () => {
    const r = projectScene(
      s,
      station,
      rotationOfPose({ azimuthRad: east.value.azimuthRad, apparentAltitudeRad: 0, rollRad: 0 }),
      layout(),
    );
    if (!r.ok) throw new Error(r.reason);
    const [front, back] = r.value.targets;
    expect(front?.visible).toBe(true);
    expect(Math.abs((front?.point?.xPx ?? 0) - 195)).toBeLessThan(1e-6);
    expect(Math.abs((front?.point?.yPx ?? 0) - 422)).toBeLessThan(1e-6);
    expect(back?.visible).toBe(false);
    expect(back?.point).toBeNull();
    // A level camera: the horizon is the horizontal line through the centre, across the Element.
    const h = r.value.horizon;
    expect(h !== null && Math.abs(h.a.yPx - 422) < 1e-6 && Math.abs(h.b.yPx - 422) < 1e-6).toBe(
      true,
    );
    expect(
      h !== null && Math.min(h.a.xPx, h.b.xPx) === 0 && Math.max(h.a.xPx, h.b.xPx) === 390,
    ).toBe(true);
  });

  it('a steep camera has no horizon in view', () => {
    const r = projectScene(
      s,
      station,
      rotationOfPose({ azimuthRad: 0, apparentAltitudeRad: fromDeg(78), rollRad: 0 }),
      layout(),
    );
    expect(r.ok && r.value.horizon).toBeNull();
  });

  it('a rolled camera has a tilted horizon', () => {
    const r = projectScene(
      s,
      station,
      rotationOfPose({ azimuthRad: 0, apparentAltitudeRad: 0, rollRad: fromDeg(20) }),
      layout(),
    );
    if (!r.ok || r.value.horizon === null) throw new Error('horizon');
    const { a, b } = r.value.horizon;
    const tilt = Math.abs(Math.atan2(b.yPx - a.yPx, b.xPx - a.xPx));
    expect(Math.min(tilt, Math.PI - tilt)).toBeGreaterThan(fromDeg(19.9));
    expect(Math.min(tilt, Math.PI - tilt)).toBeLessThan(fromDeg(20.1));
  });

  it('gives the Sun a radius of F · tan(r)', () => {
    const sun = scene([
      {
        kind: 'sun',
        id: 'sun',
        label: 'Sun',
        azimuthRad: 0,
        apparentAltitudeRad: 0.3,
        angularRadiusRad: fromDeg(0.267),
      },
    ]);
    const r = projectScene(
      sun,
      first(sun.stations),
      rotationOfPose({ azimuthRad: 0, apparentAltitudeRad: 0.3, rollRad: 0 }),
      layout(),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(
      Math.abs((r.value.targets[0]?.radiusPx ?? 0) - r.value.focalPx * Math.tan(fromDeg(0.267))),
    ).toBeLessThan(1e-12);
  });

  // A Target on a `contain` bar is inside the Element but not on the image: it is not visible
  // (Req 16.3), so that every visible Target can be tapped.
  it('does not show a Target on a contain bar', () => {
    const r = projectScene(
      s,
      station,
      rotationOfPose({
        azimuthRad: east.value.azimuthRad,
        apparentAltitudeRad: fromDeg(-33),
        rollRad: 0,
      }),
      layout('contain'),
    );
    if (!r.ok) throw new Error(r.reason);
    const t = r.value.targets[0];
    expect(t?.point).not.toBeNull();
    expect(t?.visible).toBe(false);
  });
});

function distanceToLine(
  p: { xPx: number; yPx: number },
  a: { xPx: number; yPx: number },
  b: { xPx: number; yPx: number },
): number {
  const dx = b.xPx - a.xPx;
  const dy = b.yPx - a.yPx;
  return Math.abs(dx * (p.yPx - a.yPx) - dy * (p.xPx - a.xPx)) / Math.hypot(dx, dy);
}

describe('the horizon at the exact limit (the standing rule of P-16.9)', () => {
  // At a camera altitude of exactly -80°, the horizon's foot (the horizon point at the camera's
  // azimuth) is at exactly 80° from the axis, and Sensors' inverse places it or not by rounding.
  // A landmark there is the same direction, so it is visible exactly when the horizon is found,
  // and then lies on it. P-16.9 draws the altitude at least 1e-6 rad inside ±80°.
  it('shows the landmark at the foot exactly when it finds the horizon, at exactly -80°', () => {
    const wide = imageLayout(
      { widthSourcePx: 8192, heightSourcePx: 64 },
      { widthPx: 4096, heightPx: 64 },
      'cover',
    );
    if (!wide.ok) throw new Error('layout');
    const pose = { azimuthRad: 0.7, apparentAltitudeRad: -fromDeg(80), rollRad: Math.PI / 2 };
    const built = sceneFromOffsets({
      id: 's',
      name: 'Limit',
      origin: CATALOGUE_ORIGIN,
      calibration: {
        fovRad: fromDeg(150),
        fovAxis: 'height',
        fovSigmaRad: fromDeg(0.01),
        imageWidthSourcePx: 8192,
        imageHeightSourcePx: 64,
      },
      stations: [
        { id: 'a', name: 'A', eastM: 0, northM: 0 },
        { id: 'b', name: 'B', eastM: 500, northM: 0 },
      ],
      targets: [
        {
          kind: 'landmark',
          id: 'h',
          label: 'Foot',
          eastM: Math.sin(0.7) * 5000,
          northM: Math.cos(0.7) * 5000,
          heightM: 0,
        },
      ],
    });
    if (!built.ok) throw new Error(built.reason);
    const r = projectScene(
      built.value,
      first(built.value.stations),
      rotationOfPose(pose),
      wide.value,
    );
    if (!r.ok) throw new Error(r.reason);
    const t = r.value.targets[0];
    const h = r.value.horizon;
    expect(t?.visible).toBe(h !== null);
    if (h !== null && t?.point != null)
      expect(distanceToLine(t.point, h.a, h.b)).toBeLessThan(1e-6);
  });
});

describe('the two constructions of the horizon (Req 16.3, §7.13)', () => {
  it('give the same line at the switch, 45°, at any roll', () => {
    const s = scene();
    for (const rollRad of [0, 0.4, -1.2, Math.PI / 2, 2.9]) {
      for (const sign of [1, -1]) {
        const rotation = rotationOfPose({
          azimuthRad: 1.3,
          apparentAltitudeRad: sign * HORIZON_FOOT_FROM_RAD,
          rollRad,
        });
        const pair = horizonByPair(s, rotation, layout());
        const foot = horizonByFoot(s, rotation, layout());
        if (pair === null || foot === null) throw new Error('horizon');
        // Every point of one lies on the other's line.
        for (const p of pair) expect(distanceToLine(p, foot[0], foot[1])).toBeLessThan(1e-9);
        expect(distanceToLine(foot[0], pair[0], pair[1])).toBeLessThan(1e-9);
      }
    }
  });

  // Shrunk counterexample of P-16.9 (checkpoint 20, rebuilt on the image): a camera 1e-6 rad
  // inside -80°, rolled 1.6e-5 rad off π/2, in a layout whose image reaches 80° of offset across.
  // The pair of points at the camera's azimuth ± 20° falls beyond 80° and gave no horizon, while
  // the horizon landmark at the camera's azimuth is on the image.
  it('finds the horizon through a visible landmark where the pair of points cannot', () => {
    const wide = imageLayout(
      { widthSourcePx: 8192, heightSourcePx: 64 },
      { widthPx: 4096, heightPx: 64 },
      'cover',
    );
    if (!wide.ok) throw new Error('layout');
    const calibration = {
      fovRad: fromDeg(150),
      fovAxis: 'height' as const,
      fovSigmaRad: fromDeg(0.01),
      imageWidthSourcePx: 8192,
      imageHeightSourcePx: 64,
    };
    const pose = {
      azimuthRad: 3.9353344147745806,
      apparentAltitudeRad: -fromDeg(80) + 1e-6,
      rollRad: 1.5708121492254534,
    };
    const along = (m: number) => ({
      eastM: Math.sin(pose.azimuthRad) * m,
      northM: Math.cos(pose.azimuthRad) * m,
    });
    const built = sceneFromOffsets({
      id: 's',
      name: 'Shrunk',
      origin: { latRad: -1.0493908057792276, lonRad: 3.1371809681887477 },
      calibration,
      stations: [
        { id: 'a', name: 'A', eastM: 0, northM: 0 },
        { id: 'b', name: 'B', eastM: 500, northM: 0 },
      ],
      targets: [{ kind: 'landmark', id: 'h', label: 'On the horizon', ...along(5000), heightM: 0 }],
    });
    if (!built.ok) throw new Error(built.reason);
    const rotation = rotationOfPose(pose);
    const r = projectScene(built.value, first(built.value.stations), rotation, wide.value);
    if (!r.ok) throw new Error(r.reason);
    const t = r.value.targets[0];
    expect(t?.visible).toBe(true);
    expect(horizonByPair(built.value, rotation, wide.value)).toBeNull();
    const h = r.value.horizon;
    if (h === null || t?.point == null) throw new Error('no horizon');
    expect(distanceToLine(t.point, h.a, h.b)).toBeLessThan(1e-6);
  });
});

describe('clipLine (Liang–Barsky)', () => {
  it('clips a line to the rectangle and misses one outside', () => {
    expect(clipLine({ xPx: 0, yPx: 5 }, { xPx: 1, yPx: 5 }, 10, 10)).toEqual({
      a: { xPx: 0, yPx: 5 },
      b: { xPx: 10, yPx: 5 },
    });
    expect(clipLine({ xPx: 0, yPx: 20 }, { xPx: 1, yPx: 20 }, 10, 10)).toBeNull();
    expect(clipLine({ xPx: 5, yPx: 0 }, { xPx: 5, yPx: 1 }, 10, 10)).toEqual({
      a: { xPx: 5, yPx: 0 },
      b: { xPx: 5, yPx: 10 },
    });
    expect(clipLine({ xPx: 0, yPx: 0 }, { xPx: 1, yPx: 1 }, 10, 10)).toEqual({
      a: { xPx: 0, yPx: 0 },
      b: { xPx: 10, yPx: 10 },
    });
  });
});

describe('aimAfterDrag (Req 17.10)', () => {
  it('turns left for a drag to the right, up for a drag down, and keeps the roll', () => {
    const r = aimAfterDrag({ azimuthRad: 1, apparentAltitudeRad: 0, rollRad: 0.2 }, 100, 50, 500);
    expect(r.ok && Math.abs(r.value.azimuthRad - (1 - Math.atan(0.2))) < 1e-15).toBe(true);
    expect(r.ok && Math.abs(r.value.apparentAltitudeRad - Math.atan(0.1)) < 1e-15).toBe(true);
    expect(r.ok && r.value.rollRad).toBe(0.2);
  });
  it('divides the azimuth change by cos h, limits the altitude to 80° and wraps the azimuth', () => {
    const r = aimAfterDrag(
      { azimuthRad: 0.01, apparentAltitudeRad: fromDeg(60), rollRad: 0 },
      100,
      1e6,
      500,
    );
    expect(
      r.ok && Math.abs(r.value.azimuthRad - (0.01 - Math.atan(0.2) / 0.5 + 2 * Math.PI)) < 1e-12,
    ).toBe(true);
    expect(r.ok && r.value.apparentAltitudeRad).toBe(fromDeg(80));
  });
  it('names a value that is not finite, a focal length not positive and a pose beyond 80°', () => {
    expect(
      aimAfterDrag({ azimuthRad: 0, apparentAltitudeRad: 0, rollRad: 0 }, Number.NaN, 0, 500),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'dxPx' });
    expect(aimAfterDrag({ azimuthRad: 0, apparentAltitudeRad: 0, rollRad: 0 }, 0, 0, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'focalPx',
    });
    expect(
      aimAfterDrag({ azimuthRad: 0, apparentAltitudeRad: fromDeg(81), rollRad: 0 }, 0, 0, 5),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'apparentAltitudeRad' });
  });
});
