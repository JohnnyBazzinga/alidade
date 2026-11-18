import {
  CONFIDENCE_95_SCALE,
  degToRad,
  greatCircleDistanceM,
  initialAzimuthRad,
  projectToLocalPlane,
  wrapPi,
  type Position,
} from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed, uniform, uniformInteger } from '../../test-support/generators';
import {
  bearingCase,
  brokenFixCase,
  fixAround,
  fixCase,
  mapPosition,
} from '../../test-support/map-generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { bearingFeatures } from './bearing-features';
import { fixFeatures } from './fix-features';
import type { FeatureCollection, LonLat } from './geojson';
import { mapBounds } from './map-bounds';
import { observerFeatures } from './observer-features';

const RUNS = 10_000;
const DEG = Math.PI / 180;

function toPosition([lonDeg, latDeg]: LonLat): Position {
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);
  return { latRad: lat.ok ? lat.value : Number.NaN, lonRad: lon.ok ? lon.value : Number.NaN };
}

function wrapped(x: number): number {
  const w = wrapPi(x);
  return w.ok ? Math.abs(w.value) : Number.POSITIVE_INFINITY;
}

function ringOf(c: FeatureCollection, kind: string): readonly LonLat[] {
  const f = c.features.find((x) => x.properties.kind === kind);
  return f?.geometry.type === 'Polygon' ? (f.geometry.coordinates[0] ?? []) : [];
}

/** Any collection the map functions produce: observers, a Bearing, or a Fix. */
const anyCollection: fc.Arbitrary<FeatureCollection | null> = fc.oneof(
  fc
    .array(fc.record({ id: fc.string({ minLength: 1, maxLength: 8 }), position: mapPosition() }), {
      maxLength: 5,
    })
    .map((o) => {
      const r = observerFeatures(o);
      return r.ok ? r.value : null;
    }),
  bearingCase().map((c) => {
    const r = bearingFeatures(c.bearing, c.lineLengthM, c.arcStepRad);
    return r.ok ? r.value : null;
  }),
  fixCase().map((c) => {
    const r = fixFeatures(c.fix, c.vertexCount);
    return r.ok ? r.value : null;
  }),
);

// P-14.7 (Req 14.7): every collection the map functions produce is plain JSON (a JSON round
// trip gives an equal value) and every feature carries `kind` and `id`.
describe('P-14.7 plain JSON', () => {
  it('survives JSON and labels every feature', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.7',
      fc.property(anyCollection, (c) => {
        if (c === null) return false;
        const same = JSON.stringify(JSON.parse(JSON.stringify(c))) === JSON.stringify(c);
        const parsed: unknown = JSON.parse(JSON.stringify(c));
        let equal = same;
        try {
          expect(parsed).toStrictEqual(c);
        } catch {
          equal = false;
        }
        const labelled = c.features.every(
          (f) =>
            typeof f.properties.kind === 'string' &&
            typeof f.properties.id === 'string' &&
            f.id.length > 0,
        );
        tracker.record(
          'collections that differ or lack a label (must be 0)',
          equal && labelled ? 0 : 1,
          '0',
        );
        return equal && labelled;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

// P-14.8 (Req 14.8): the line's end lies at the length within 1e-4 m and at the azimuth within
// 1e-9 rad; every arc vertex at the length within 1e-4 m and within [az − σ, az + σ] extended by
// 1e-9; the first and last arc vertices at the edges within 1e-9; consecutive arc vertices at
// most step + 2e-9 apart in azimuth. Domain: `bearingCase`.
describe('P-14.8 the line and the Wedge', () => {
  it('puts every vertex where it belongs', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.8',
      fc.property(bearingCase(), ({ bearing, lineLengthM, arcStepRad }) => {
        const r = bearingFeatures(bearing, lineLengthM, arcStepRad);
        if (!r.ok) return false;
        const line = r.value.features[0];
        if (line?.geometry.type !== 'LineString') return false;
        const endLonLat = line.geometry.coordinates[1];
        if (endLonLat === undefined) return false;
        const end = toPosition(endLonLat);
        const d = greatCircleDistanceM(bearing.observer, end);
        const az = initialAzimuthRad(bearing.observer, end);
        if (!d.ok || !az.ok) return false;
        let distanceError = Math.abs(d.value - lineLengthM);
        const lineAzimuthError = wrapped(az.value - bearing.azimuthRad);
        const ring = ringOf(r.value, 'bearing-wedge');
        const arc = ring.slice(1, -1).map(toPosition);
        const azimuths: number[] = [];
        for (const v of arc) {
          const dv = greatCircleDistanceM(bearing.observer, v);
          const av = initialAzimuthRad(bearing.observer, v);
          if (!dv.ok || !av.ok) return false;
          distanceError = Math.max(distanceError, Math.abs(dv.value - lineLengthM));
          // Relative to the azimuth: in [-σ, σ] for a good vertex.
          const rel = wrapPi(av.value - bearing.azimuthRad);
          if (!rel.ok) return false;
          azimuths.push(rel.value);
        }
        const sigma = bearing.azimuthSigmaRad;
        const outside = Math.max(0, ...azimuths.map((a) => Math.abs(a) - sigma));
        // The ring runs v_n … v_0: from +σ down to −σ.
        const edgeError = Math.max(
          Math.abs((azimuths[0] ?? Number.NaN) - sigma),
          Math.abs((azimuths[azimuths.length - 1] ?? Number.NaN) + sigma),
        );
        let spacing = 0;
        for (let i = 1; i < azimuths.length; i += 1)
          spacing = Math.max(spacing, Math.abs((azimuths[i] ?? 0) - (azimuths[i - 1] ?? 0)));
        const ringClosed = ring.length >= 4 && ring[0] === ring[ring.length - 1];
        tracker.record('distance error [m]', distanceError, '1e-4');
        tracker.record('line azimuth error [rad]', lineAzimuthError, '1e-9');
        tracker.record('arc vertex beyond ±σ [rad]', outside, '1e-9');
        tracker.record('edge error [rad]', edgeError, '1e-9');
        tracker.record('spacing beyond the step [rad]', Math.max(0, spacing - arcStepRad), '2e-9');
        return (
          ringClosed &&
          distanceError <= 1e-4 &&
          lineAzimuthError <= 1e-9 &&
          outside <= 1e-9 &&
          edgeError <= 1e-9 &&
          spacing <= arcStepRad + 2e-9
        );
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

/** The ring of a Fix in its Local plane and in the 95 % ellipse's axes. */
function ellipseAxes(c: {
  fix: {
    position: Position;
    ellipse: { semiMajorM: number; semiMinorM: number; azimuthRad: number };
  };
  vertexCount: number;
}) {
  const r = fixFeatures(c.fix as Parameters<typeof fixFeatures>[0], c.vertexCount);
  if (!r.ok) return null;
  const ring = ringOf(r.value, 'fix-ellipse-95');
  const a = c.fix.ellipse.semiMajorM * 2.4477;
  const b = c.fix.ellipse.semiMinorM * 2.4477;
  const s = Math.sin(c.fix.ellipse.azimuthRad);
  const co = Math.cos(c.fix.ellipse.azimuthRad);
  const local: { e: number; n: number; u: number; v: number }[] = [];
  for (const vertex of ring) {
    const p = projectToLocalPlane(c.fix.position, toPosition(vertex));
    if (!p.ok) return null;
    const e = p.value.eastM;
    const n = p.value.northM;
    local.push({ e, n, u: e * s + n * co, v: -e * co + n * s });
  }
  return { ring, local, a, b };
}

// P-14.9 (Req 14.9): every vertex, projected to the Fix's Local plane and expressed in the
// ellipse's axes, satisfies (u/a)² + (v/b)² = 1 within 1e-9 + 2e-4/b. Domain: `fixCase`.
describe('P-14.9 the vertices lie on the 95 % ellipse', () => {
  it('satisfies the ellipse equation', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.9',
      fc.property(fixCase(), (c) => {
        const g = ellipseAxes(c);
        if (g === null) return false;
        const tolerance = 1e-9 + 2e-4 / g.b;
        let worst = 0;
        for (const p of g.local)
          worst = Math.max(worst, Math.abs((p.u / g.a) ** 2 + (p.v / g.b) ** 2 - 1));
        tracker.record('|(u/a)² + (v/b)² − 1| / tolerance', worst / tolerance, '1 (1e-9 + 2e-4/b)');
        return worst <= tolerance;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

// P-14.10 (Req 14.10): the ring is closed exactly, counter-clockwise in the Local plane, its
// distinct vertices average to the Fix within 1e-4 m + 1e-9·a, vertex 0 is on the major axis at
// distance a within 1e-4 m + 1e-9·a, and a / (1-sigma semi-major) = 2.4477 within 1e-9.
describe('P-14.10 the ring', () => {
  it('is closed, counter-clockwise, centred and scaled by 2.4477', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.10',
      fc.property(fixCase(), (c) => {
        const g = ellipseAxes(c);
        if (g === null) return false;
        const first = g.ring[0];
        const last = g.ring[g.ring.length - 1];
        const closed =
          first !== undefined &&
          last !== undefined &&
          Object.is(first[0], last[0]) &&
          Object.is(first[1], last[1]);
        let area = 0;
        for (let i = 0; i + 1 < g.local.length; i += 1) {
          const p = g.local[i];
          const q = g.local[i + 1];
          if (p && q) area += p.e * q.n - q.e * p.n;
        }
        const distinct = g.local.slice(0, -1);
        const meanE = distinct.reduce((s, p) => s + p.e, 0) / distinct.length;
        const meanN = distinct.reduce((s, p) => s + p.n, 0) / distinct.length;
        const tol = 1e-4 + 1e-9 * g.a;
        const centreError = Math.hypot(meanE, meanN);
        const v0 = g.local[0];
        const vertex0Error =
          v0 === undefined
            ? Infinity
            : Math.max(Math.abs(Math.hypot(v0.e, v0.n) - g.a), Math.abs(v0.v));
        const ratioError = Math.abs(g.a / c.fix.ellipse.semiMajorM - 2.4477);
        tracker.record('centre error / tolerance', centreError / tol, '1 (1e-4 + 1e-9·a)');
        tracker.record('vertex 0 error / tolerance', vertex0Error / tol, '1 (1e-4 + 1e-9·a)');
        tracker.record('a / semiMajor − 2.4477', ratioError, '1e-9');
        return (
          closed &&
          area > 0 &&
          centreError <= tol &&
          vertex0Error <= tol &&
          ratioError <= 1e-9 &&
          CONFIDENCE_95_SCALE === 2.4477
        );
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

// P-14.11 (Req 14.11): each edge midpoint, in the ellipse's axes, satisfies
// (u/a)² + (v/b)² = cos²(π/N) within 1e-9 + 2e-4/b.
describe("P-14.11 the edges sag by a regular polygon's amount", () => {
  it('puts each edge midpoint on the inner ellipse', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.11',
      fc.property(fixCase(), (c) => {
        const g = ellipseAxes(c);
        if (g === null) return false;
        const target = Math.cos(Math.PI / c.vertexCount) ** 2;
        const tolerance = 1e-9 + 2e-4 / g.b;
        let worst = 0;
        for (let i = 0; i + 1 < g.local.length; i += 1) {
          const p = g.local[i];
          const q = g.local[i + 1];
          if (!p || !q) return false;
          const u = (p.u + q.u) / 2;
          const v = (p.v + q.v) / 2;
          worst = Math.max(worst, Math.abs((u / g.a) ** 2 + (v / g.b) ** 2 - target));
        }
        tracker.record(
          '|midpoint − cos²(π/N)| / tolerance',
          worst / tolerance,
          '1 (1e-9 + 2e-4/b)',
        );
        return worst <= tolerance;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

// P-14.12 (Req 14.12): a Fix whose Ellipse `ellipse95` refuses or is not an ellipse gives a
// failure and no Point. Domain: `brokenFixCase`.
describe('P-14.12 no Point without an ellipse', () => {
  it('fails for every broken Ellipse', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.12',
      fc.property(brokenFixCase(), (c) => {
        const r = fixFeatures(c.fix, c.vertexCount);
        tracker.record('broken Ellipses drawn (must be 0)', r.ok ? 1 : 0, '0');
        return !r.ok && !('value' in r);
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

/**
 * Domain (P-14.13): one centre (latitude in [-70°, 70°], longitude in [-155°, 155°]); 1 to 4
 * Bearings from observers within 30 km (each axis) of it with lengths up to 150 km, and 0 to 2
 * Fixes within 30 km with 1-sigma axes up to 10 km, so that everything lies within 500 km of
 * everything else and within (-170°, 170°) of longitude; and sets straddling ±180°: two observers within
 * 0.5° either side of the antimeridian.
 */
const boundsCase = fc.record({
  latRad: closed(-70 * DEG, 70 * DEG),
  lonRad: closed(-155 * DEG, 155 * DEG),
  bearings: fc.array(
    fc.record({
      dE: closed(-30_000, 30_000),
      dN: closed(-30_000, 30_000),
      az: uniform(0, 2 * Math.PI),
      sigma: closed(0.01 * DEG, 45 * DEG),
      len: closed(100, 150_000),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  fixes: fc.array(
    fc.record({
      dE: closed(-30_000, 30_000),
      dN: closed(-30_000, 30_000),
      major: closed(1, 10_000),
      share: closed(0, 1),
      az: uniform(0, Math.PI),
      n: uniformInteger(16, 72),
    }),
    { maxLength: 2 },
  ),
});

// P-14.13 (Req 14.13): every coordinate of a set within 500 km and within (-170°, 170°) lies in
// the box of `mapBounds`; a set straddling ±180° is `crosses_antimeridian`.
describe('P-14.13 bounds', () => {
  it('hold every coordinate, and refuse a set across ±180°', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.13',
      fc.property(
        boundsCase,
        closed(0.001, 0.5),
        closed(0.001, 0.5),
        closed(-60, 60),
        (c, westOffsetDeg, eastOffsetDeg, latDeg) => {
          const centre = { latRad: c.latRad, lonRad: c.lonRad };
          const collections: FeatureCollection[] = [];
          for (const b of c.bearings) {
            const observer = {
              latRad: centre.latRad + b.dN / 6_371_008.8,
              lonRad: centre.lonRad + b.dE / (6_371_008.8 * Math.cos(centre.latRad)),
            };
            const r = bearingFeatures(
              {
                id: 'b',
                observer,
                positionAccuracyM: 5,
                timeUtcMs: 0,
                azimuthRad: b.az,
                azimuthSigmaRad: b.sigma,
              },
              b.len,
              DEG,
            );
            if (!r.ok) return false;
            collections.push(r.value);
          }
          for (const f of c.fixes) {
            const position = {
              latRad: centre.latRad + f.dN / 6_371_008.8,
              lonRad: centre.lonRad + f.dE / (6_371_008.8 * Math.cos(centre.latRad)),
            };
            const r = fixFeatures(
              fixAround(position, {
                semiMajorM: f.major,
                semiMinorM: Math.max(1, f.major * f.share),
                azimuthRad: f.az,
              }),
              f.n,
            );
            if (!r.ok) return false;
            collections.push(r.value);
          }
          const bounds = mapBounds(collections);
          if (!bounds.ok) return false;
          let outside = 0;
          for (const col of collections) {
            for (const feat of col.features) {
              const coords =
                feat.geometry.type === 'Point'
                  ? [feat.geometry.coordinates]
                  : feat.geometry.type === 'LineString'
                    ? feat.geometry.coordinates
                    : feat.geometry.coordinates.flat();
              for (const [lon, lat] of coords) {
                if (
                  lon < bounds.value.westDeg ||
                  lon > bounds.value.eastDeg ||
                  lat < bounds.value.southDeg ||
                  lat > bounds.value.northDeg
                )
                  outside += 1;
              }
            }
          }
          const straddle = observerFeatures([
            { id: 'w', position: { latRad: latDeg * DEG, lonRad: (180 - westOffsetDeg) * DEG } },
            { id: 'e', position: { latRad: latDeg * DEG, lonRad: (-180 + eastOffsetDeg) * DEG } },
          ]);
          if (!straddle.ok) return false;
          const refused = mapBounds([...collections.slice(0, 1), straddle.value]);
          tracker.record('coordinates outside the box (must be 0)', outside, '0');
          return outside === 0 && !refused.ok && refused.reason === 'crosses_antimeridian';
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});
