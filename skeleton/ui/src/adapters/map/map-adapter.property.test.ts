import type { Bearing, Fix, Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_APP_LAYERS, WEDGE_ARC_STEP_RAD } from '../../defaults';
import type { AppFeatureCollection, LayerPaint } from '../../math/map/app-layer';
import { bearingFeatures } from '../../math/map/bearing-features';
import { fixFeatures } from '../../math/map/fix-features';
import { EMPTY_COLLECTION, type Feature, type FeatureCollection } from '../../math/map/geojson';
import { observerFeatures } from '../../math/map/observer-features';
import {
  appLayerOp,
  fillLayers,
  SKELETON_KINDS,
  type LayerOp,
  type Verdict,
} from '../../test-support/app-layer-generators';
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
  | { kind: 'load' }
  | LayerOp;

/**
 * Domain (P-15.11, P-15.12): 0 to 100 calls of the five operations, with valid and invalid
 * arguments: observers at any `mapPosition` or at an unsupported latitude; 1 to 3 Bearings of
 * `bearingCase` with a length in [100, 500 000] m, or 0 (refused); a Fix of `fixCase` or of
 * `brokenFixCase`; `clearFix`; `fitToFeatures` with a padding in [-10, 50] px; and the map's
 * `load` event at any point (fired at the end if it was not); and, for P-15.17, `setLayer` and
 * `clearLayer` calls (`appLayerOp`: ten ids, valid or with exactly one defect, each draw carrying
 * its verdict) in about three calls in eleven.
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
  appLayerOp(),
  appLayerOp(),
  appLayerOp(),
);
/**
 * Sequences of 0 to 100 calls; three in four are drawn from `op` alone, one in four begin with
 * `fillLayers` (8 to 10 valid `setLayer` calls), so that the limit of 8 application layers, and
 * the change of a held layer's paint, are reached often (counted by P-15.17).
 */
const ops: fc.Arbitrary<Op[]> = fc.oneof(
  { weight: 3, arbitrary: fc.array(op, { maxLength: 100 }) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fillLayers(), fc.array(op, { maxLength: 90 }))
      .map(([prefix, rest]) => [...prefix, ...rest]),
  },
);

function kinds(data: unknown): string[] {
  const c = data as FeatureCollection | undefined;
  return (c?.features ?? []).map((f: Feature) => f.properties.kind);
}

/**
 * How many of the layer rules of Req 15.16 and 15.17 the map breaks, given the layers the
 * property's own model says are held (in the order their ids were first set): each held layer is
 * on the map with the type of its paint and exactly its last data; no other application layer or
 * source is there; the application layers are in the model's order and all before `wedges-fill`;
 * the skeleton's layers are the style's, in the style's order; no application layer holds a
 * feature of a skeleton kind.
 */
function layerViolations(
  map: ReturnType<FakeMapLibre['last']>,
  held: ReadonlyMap<string, { collection: AppFeatureCollection; paint: LayerPaint }>,
  initialIds: readonly string[],
): number {
  let bad = 0;
  const ids = map.layerIds();
  const app = ids.filter((id) => id.startsWith('app-'));
  if (
    !deepSame(
      app,
      [...held.keys()].map((id) => `app-${id}`),
    )
  )
    bad += 1;
  if (
    !deepSame(
      ids.filter((id) => !id.startsWith('app-')),
      initialIds,
    )
  )
    bad += 1;
  const wedges = ids.indexOf('wedges-fill');
  if (app.some((id) => ids.indexOf(id) > wedges)) bad += 1;
  for (const [id, h] of held) {
    const layer = map.layers.find((l) => l.id === `app-${id}`);
    if (layer === undefined || layer.type !== h.paint.kind) bad += 1;
    if (!deepSame(map.data.get(`app-${id}`), h.collection)) bad += 1;
  }
  for (const key of map.data.keys()) {
    if (key.startsWith('app-') && !held.has(key.slice(4))) bad += 1;
  }
  for (const id of held.keys()) {
    const data = map.data.get(`app-${id}`) as AppFeatureCollection | undefined;
    for (const f of data?.features ?? []) {
      if ((SKELETON_KINDS as readonly string[]).includes(f.properties.kind)) bad += 1;
    }
  }
  return bad;
}

function run(sequence: readonly Op[]) {
  const lib = new FakeMapLibre();
  const created = createMapAdapter(lib, 'map', null, new FakeTimer());
  if (!created.ok) throw new Error(created.reason);
  const adapter = created.value;
  const map = lib.last();
  let loaded = false;
  const initialIds = map.layerIds();
  const held = new Map<string, { collection: AppFeatureCollection; paint: LayerPaint }>();
  const counts = { accepted: 0, limit: 0, defect: 0, cleared: 0, rebuilt: 0 };
  let wrong = 0;
  const checks: {
    op: Op;
    ok: boolean;
    fixData: unknown;
    loaded: boolean;
    layerViolations: number;
  }[] = [];
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
    } else if (o.kind === 'setLayer' || o.kind === 'clearLayer') {
      const result =
        o.kind === 'setLayer'
          ? adapter.setLayer(
              o.id as string,
              o.collection as AppFeatureCollection,
              o.paint as LayerPaint,
            )
          : adapter.clearLayer(o.id as string);
      let expected: Verdict = o.verdict;
      // The limit is checked after the id and the paint and before the collection (Req 15.15, D31.3):
      // a ninth layer with a valid or a defective collection is refused as `layers`.
      const collectionDefect =
        !expected.ok &&
        (expected.field === 'collection' ||
          expected.field === 'features' ||
          expected.field.startsWith('features['));
      if (
        o.kind === 'setLayer' &&
        (expected.ok || collectionDefect) &&
        typeof o.id === 'string' &&
        !held.has(o.id) &&
        held.size >= MAX_APP_LAYERS
      )
        expected = { ok: false, field: 'layers' };
      const matches = expected.ok
        ? result.ok
        : !result.ok && result.reason === 'invalid_number' && result.field === expected.field;
      if (!matches) wrong += 1;
      ok = result.ok;
      if (o.kind === 'setLayer') {
        if (expected.ok) {
          counts.accepted += 1;
          const before = held.get(o.id as string);
          if (before !== undefined && !deepSame(before.paint, o.paint)) counts.rebuilt += 1;
          held.set(o.id as string, {
            collection: o.collection as AppFeatureCollection,
            paint: o.paint as LayerPaint,
          });
        } else if (expected.field === 'layers') counts.limit += 1;
        else counts.defect += 1;
      } else if (expected.ok) {
        counts.cleared += 1;
        held.delete(o.id as string);
      }
    } else {
      ok = adapter.fitToFeatures(o.paddingPx).ok;
    }
    checks.push({
      op: o,
      ok,
      fixData: map.data.get('fix'),
      loaded,
      layerViolations: loaded ? layerViolations(map, held, initialIds) : 0,
    });
  }
  if (!loaded) map.fire('load');
  const finalViolations = layerViolations(map, held, initialIds);
  return { map, checks, last, wrong, counts, finalViolations };
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

// P-15.17 (Req 15.16, 15.17): after every call on a loaded map, with up to 100 calls of `setLayer`,
// `clearLayer` and the operations of P-15.11, valid and invalid: each call returned `ok` exactly
// when its draw's verdict says (a valid `setLayer` of a ninth id fails naming `layers`); the data
// of each held layer is the last collection successfully given to it, and a cleared or refused one
// is not on the map; no application layer holds a feature of a skeleton kind; the application
// layers are before `wedges-fill`, in the order in which their ids were first set; the skeleton's
// layers are the style's, in its order. That no call changes the Fix, the Bearings or the
// observers is P-15.11 and P-15.12, which run on the same sequences. Domain: `ops` above. The
// counts of what the sequences did are reported and must not be none.
describe('P-15.17 application layers never touch the skeleton’s', () => {
  it('keeps the data, the order and the verdicts of every layer', () => {
    const tracker = new ErrorTracker();
    const total = { accepted: 0, limit: 0, defect: 0, cleared: 0, rebuilt: 0 };
    checkProperty(
      'P-15.17',
      fc.property(ops, (sequence) => {
        const { checks, wrong, counts, finalViolations } = run(sequence);
        const violations = checks.reduce((n, c) => n + c.layerViolations, 0) + finalViolations;
        for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += counts[k];
        tracker.record('calls with the wrong verdict (must be 0)', wrong, '0');
        tracker.record('layer rules broken (must be 0)', violations, '0');
        return wrong === 0 && violations === 0;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    console.log(
      `[coverage] P-15.17: ${total.accepted} setLayer accepted (${total.rebuilt} with a new paint), ` +
        `${total.limit} refused by the limit, ${total.defect} refused for a defect, ${total.cleared} cleared`,
    );
    expect(total.accepted).toBeGreaterThan(0);
    expect(total.limit).toBeGreaterThan(0);
    expect(total.defect).toBeGreaterThan(0);
    expect(total.cleared).toBeGreaterThan(0);
    expect(total.rebuilt).toBeGreaterThan(0);
  });
});
