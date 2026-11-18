import type { Bearing, Fix, Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { WEDGE_ARC_STEP_RAD } from '../../defaults';
import { bearingFeatures } from '../../math/map/bearing-features';
import { fixFeatures } from '../../math/map/fix-features';
import { EMPTY_COLLECTION, type Feature, type FeatureCollection } from '../../math/map/geojson';
import { observerFeatures } from '../../math/map/observer-features';
import { deepSame } from '../../test-support/deep-same';
import { FakeMapLibre } from '../../test-support/fake-maplibre';
import { FakeTimer } from '../../test-support/fake-timer';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed } from '../../test-support/generators';
import {
  bearingCase,
  brokenFixCase,
  fixCase,
  mapPosition,
} from '../../test-support/map-generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { createMapAdapter } from './map-adapter';

const RUNS = 2_000;

type Op =
  | { kind: 'observers'; observers: { id: string; position: Position }[] }
  | { kind: 'bearings'; bearings: Bearing[]; lineLengthM: number }
  | { kind: 'fix'; fix: Fix }
  | { kind: 'clearFix' }
  | { kind: 'fit'; paddingPx: number }
  | { kind: 'load' };

/**
 * Domain (P-15.11, P-15.12): 0 to 100 calls of the five operations, with valid and invalid
 * arguments: observers at any `mapPosition` or at an unsupported latitude; 1 to 3 Bearings of
 * `bearingCase` with a length in [100, 500 000] m, or 0 (refused); a Fix of `fixCase` or of
 * `brokenFixCase`; `clearFix`; `fitToFeatures` with a padding in [-10, 50] px; and the map's
 * `load` event at any point (fired at the end if it was not).
 */
const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('observers' as const),
    observers: fc.array(
      fc.record({
        id: fc.constantFrom('o1', 'o2', 'o3'),
        position: fc.oneof(
          { weight: 5, arbitrary: mapPosition() },
          { weight: 1, arbitrary: fc.constant({ latRad: 1.57, lonRad: 0 }) },
        ),
      }),
      { maxLength: 3 },
    ),
  }),
  fc.record({
    kind: fc.constant('bearings' as const),
    bearings: fc.array(
      bearingCase().map((c) => c.bearing),
      { minLength: 1, maxLength: 3 },
    ),
    lineLengthM: fc.oneof(
      { weight: 5, arbitrary: closed(100, 500_000) },
      { weight: 1, arbitrary: fc.constant(0) },
    ),
  }),
  fc.record({
    kind: fc.constant('fix' as const),
    fix: fc.oneof(
      fixCase().map((c) => c.fix),
      brokenFixCase().map((c) => c.fix),
    ),
  }),
  fc.constant({ kind: 'clearFix' as const }),
  fc.record({ kind: fc.constant('fit' as const), paddingPx: closed(-10, 50) }),
  fc.constant({ kind: 'load' as const }),
);
const ops = fc.array(op, { maxLength: 100 });

function kinds(data: unknown): string[] {
  const c = data as FeatureCollection | undefined;
  return (c?.features ?? []).map((f: Feature) => f.properties.kind);
}

function run(sequence: readonly Op[]) {
  const lib = new FakeMapLibre();
  const created = createMapAdapter(lib, 'map', null, new FakeTimer());
  if (!created.ok) throw new Error(created.reason);
  const adapter = created.value;
  const map = lib.last();
  let loaded = false;
  const checks: { op: Op; ok: boolean; fixData: unknown; loaded: boolean }[] = [];
  const last: {
    observers: FeatureCollection;
    bearings: Feature[];
    wedges: Feature[];
    fix: FeatureCollection;
  } = {
    observers: EMPTY_COLLECTION,
    bearings: [],
    wedges: [],
    fix: EMPTY_COLLECTION,
  };
  for (const o of sequence) {
    let ok = true;
    if (o.kind === 'load') {
      if (!loaded) map.fire('load');
      loaded = true;
    } else if (o.kind === 'observers') {
      ok = adapter.setObservers(o.observers).ok;
      const built = observerFeatures(o.observers);
      if (built.ok) last.observers = built.value;
    } else if (o.kind === 'bearings') {
      ok = adapter.setBearings(o.bearings, o.lineLengthM).ok;
      const all = o.bearings.map((b) => bearingFeatures(b, o.lineLengthM, WEDGE_ARC_STEP_RAD));
      if (all.every((r) => r.ok)) {
        const features = all.flatMap((r) => (r.ok ? r.value.features : []));
        last.bearings = features.filter((f) => f.properties.kind === 'bearing-line');
        last.wedges = features.filter((f) => f.properties.kind === 'bearing-wedge');
      }
    } else if (o.kind === 'fix') {
      ok = adapter.setFix(o.fix).ok;
      const built = fixFeatures(o.fix, 72);
      last.fix = built.ok ? built.value : EMPTY_COLLECTION;
    } else if (o.kind === 'clearFix') {
      ok = adapter.clearFix().ok;
      last.fix = EMPTY_COLLECTION;
    } else {
      ok = adapter.fitToFeatures(o.paddingPx).ok;
    }
    checks.push({ op: o, ok, fixData: map.data.get('fix'), loaded });
  }
  if (!loaded) map.fire('load');
  return { map, checks, last };
}

// P-15.11 (Req 15.11): after every call, on a loaded map, the Fix source holds a Point if and
// only if it holds exactly one ellipse Polygon; at most one Point; it is empty after `clearFix` or
// a failed `setFix`; and after a successful `setFix(f)` it equals `fixFeatures(f)` deeply.
describe('P-15.11 a Fix is never drawn without its ellipse', () => {
  it('keeps the Point and its ellipse together after every call', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-15.11',
      fc.property(ops, (sequence) => {
        const { checks } = run(sequence);
        let bad = 0;
        for (const c of checks) {
          if (!c.loaded) continue;
          const k = kinds(c.fixData);
          const points = k.filter((x) => x === 'fix').length;
          const ellipses = k.filter((x) => x === 'fix-ellipse-95').length;
          if (
            (points === 1) !== (ellipses === 1) ||
            points > 1 ||
            ellipses > 1 ||
            k.length !== points + ellipses
          )
            bad += 1;
          if ((c.op.kind === 'clearFix' || (c.op.kind === 'fix' && !c.ok)) && k.length !== 0)
            bad += 1;
          if (c.op.kind === 'fix' && c.ok) {
            const expected = fixFeatures(c.op.fix, 72);
            if (!expected.ok || !deepSame(c.fixData, expected.value)) bad += 1;
          }
        }
        tracker.record('calls that broke the Fix rule (must be 0)', bad, '0');
        return bad === 0;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});

// P-15.12 (Req 15.12): the map's data after any sequence equals the data built from the last
// arguments given to each operation, whatever the order of the calls and of `load`.
describe('P-15.12 the last arguments win', () => {
  it('holds the data of the last call of each operation', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-15.12',
      fc.property(ops, (sequence) => {
        const { map, last } = run(sequence);
        const same =
          deepSame(map.data.get('observers'), last.observers) &&
          deepSame(map.data.get('bearings'), {
            type: 'FeatureCollection',
            features: last.bearings,
          }) &&
          deepSame(map.data.get('wedges'), { type: 'FeatureCollection', features: last.wedges }) &&
          deepSame(map.data.get('fix'), last.fix);
        tracker.record('sources that differ (must be 0)', same ? 0 : 1, '0');
        return same;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });
});
