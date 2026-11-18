import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { appFeature, type AppShape } from '../../math/map/app-feature';
import type { AppFeature } from '../../math/map/app-layer';
import { FakeMapLibre } from '../../test-support/fake-maplibre';
import { FakeTimer } from '../../test-support/fake-timer';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { mapPosition } from '../../test-support/map-generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { createMapAdapter } from './map-adapter';

const RUNS = 10_000;
const KINDS = ['hotspot', 'wind', 'zone', 'set-aside', 'lop'];
const SKELETON = ['observer', 'bearing-line', 'bearing-wedge', 'fix', 'fix-ellipse-95'];

/**
 * Domain (P-15.18): a shape of each type: a point; a line of 2 to 6 Positions; a polygon of 3 to 6
 * (the ring open, or closed already one draw in four). Positions are `mapPosition`: latitude
 * [-84°, 84°], longitude (-π, π] (π drawn), all Supported. The kind is one of five application
 * kinds, or one of the skeleton's five one draw in six.
 */
const positions = (min: number, max: number) =>
  fc.array(mapPosition(), { minLength: min, maxLength: max });
const shape: fc.Arbitrary<AppShape> = fc.oneof(
  mapPosition().map((position) => ({ type: 'point' as const, position })),
  positions(2, 6).map((p) => ({ type: 'line' as const, positions: p })),
  fc.tuple(positions(3, 6), fc.boolean()).map(([p, closed]) => ({
    type: 'polygon' as const,
    positions: closed && p[0] !== undefined ? [...p, p[0]] : p,
  })),
);
const kind = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...KINDS) },
  { weight: 1, arbitrary: fc.constantFrom(...SKELETON) },
);

/** Longitude then latitude in degrees, computed here and not by the code under test. */
function expected(p: { latRad: number; lonRad: number }): [number, number] {
  return [(p.lonRad * 180) / Math.PI, (p.latRad * 180) / Math.PI];
}

function coordinatesOf(f: AppFeature): [number, number][] {
  const g = f.geometry;
  if (g.type === 'Point') return [[g.coordinates[0], g.coordinates[1]]];
  if (g.type === 'LineString') return g.coordinates.map((c) => [c[0], c[1]]);
  return (g.coordinates[0] ?? []).map((c) => [c[0], c[1]]);
}

// P-15.18 (Req 15.14): every coordinate `appFeature` writes is the Position it was given, longitude
// first, in degrees, within 1e-12 degrees; a polygon's ring is closed and a ring already closed is
// not closed twice; and `setLayer` accepts what it builds when the kind is not one of the
// skeleton's, and refuses it, naming the kind, when it is.
describe('P-15.18 the builder of application features', () => {
  it('writes the Positions it is given, longitude first, and setLayer takes the result', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-15.18',
      fc.property(kind, shape, (k, s) => {
        const built = appFeature(k, 'f', s);
        if (!built.ok) return false;
        const given =
          s.type === 'point' ? [s.position] : s.type === 'line' ? s.positions : s.positions;
        const written = coordinatesOf(built.value);
        const ring = s.type === 'polygon';
        const first = s.type === 'polygon' ? s.positions[0] : undefined;
        const last = s.type === 'polygon' ? s.positions[s.positions.length - 1] : undefined;
        const alreadyClosed =
          first !== undefined &&
          last !== undefined &&
          s.type === 'polygon' &&
          s.positions.length > 1 &&
          first === last;
        const wanted = ring && !alreadyClosed && first !== undefined ? [...given, first] : given;
        if (written.length !== wanted.length) return false;
        let worst = 0;
        for (const [i, w] of written.entries()) {
          const [lon, lat] = expected(wanted[i] as { latRad: number; lonRad: number });
          worst = Math.max(worst, Math.abs(w[0] - lon), Math.abs(w[1] - lat));
        }
        tracker.record('coordinate against the Position (deg)', worst, '1e-12');
        const created = createMapAdapter(new FakeMapLibre(), 'map', null, new FakeTimer());
        if (!created.ok) return false;
        const result = created.value.setLayer(
          'a',
          { type: 'FeatureCollection', features: [built.value] },
          { kind: 'circle', colour: '#102030', radiusPx: 4 },
        );
        const accepted = SKELETON.includes(k)
          ? !result.ok && result.field === 'features[0].properties.kind'
          : result.ok;
        return worst <= 1e-12 && accepted;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    expect(tracker.worst('coordinate against the Position (deg)')).toBeDefined();
  });
});
