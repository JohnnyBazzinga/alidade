import { destinationPosition, greatCircleDistanceM } from '@alidade/core';
import { MAX_APP_LAYERS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { postsIncident } from '../../test-support/geometry-fixtures';
import { NOW_UTC_MS, ORIGIN, PARAMETERS, sightingIdOf } from '../../test-support/incident-fixtures';
import { assess, type Assessment } from '../assessment/assess';
import { mapModel, SET_ASIDE_LAYER_IDS } from './map-model';

const assessed = (incident: Parameters<typeof assess>[0]): Assessment => {
  const a = assess(incident, NOW_UTC_MS, PARAMETERS);
  if (!a.ok) throw new Error('assess');
  return a.value;
};
const modelOf = (a: Assessment) => {
  const m = mapModel(a, PARAMETERS);
  if (!m.ok) throw new Error(`mapModel failed: ${m.reason}`);
  return m.value;
};

/** The wind Overlay's two layers (design §7.18; asserted again in task 17). */
const WIND_LAYER_IDS = ['wind', 'wind-head'];

describe('mapModel (Req 18.3, 18.7, design §7.18)', () => {
  const fourWithOneHidden = () =>
    postsIncident(['west', 'east', 'side', 'southwest'], (post) =>
      post === 'southwest' ? { hidden: true } : {},
    );

  it('gives the used observers with their Sighting ids and the used Bearings, and the Fix with its Ellipse', () => {
    const a = assessed(fourWithOneHidden());
    const m = modelOf(a);
    expect(m.observers.map((o) => o.id)).toEqual(a.used.map((e) => e.sighting.sightingId));
    expect(m.observers.map((o) => o.position)).toEqual(
      a.used.map((e) => e.sighting.bearing.observer),
    );
    expect(m.bearings).toEqual(a.used.map((e) => e.sighting.bearing));
    expect(m.fix).toEqual(a.fix?.ok ? a.fix.value : null);
  });

  it('draws each set-aside Sighting as a grey dashed line from its observer along its azimuth, and a grey marker', () => {
    const a = assessed(fourWithOneHidden());
    const m = modelOf(a);
    const [lines, markers] = m.layers;
    expect(m.layers.map((l) => l.id)).toEqual([...SET_ASIDE_LAYER_IDS]);
    expect(lines?.paint).toEqual({ kind: 'line', colour: '#6B6B6B', widthPx: 3, dash: [4, 3] });
    expect(markers?.paint).toEqual({ kind: 'circle', colour: '#6B6B6B', radiusPx: 5 });
    const hidden = a.setAside[0]?.entry.sighting;
    if (hidden === undefined) throw new Error('nothing set aside');
    expect(lines?.collection.features).toHaveLength(1);
    const line = lines?.collection.features[0];
    expect(line?.id).toBe(`set-aside:${hidden.sightingId}`);
    expect(line?.properties).toEqual({ kind: 'set-aside', id: hidden.sightingId });
    expect(line?.geometry.type).toBe('LineString');
    const end = destinationPosition(
      hidden.bearing.observer,
      hidden.bearing.azimuthRad,
      m.lineLengthM,
    );
    if (!end.ok || line?.geometry.type !== 'LineString') throw new Error('end');
    const [first, last] = line.geometry.coordinates;
    expect(first?.[1]).toBeCloseTo((hidden.bearing.observer.latRad * 180) / Math.PI, 9);
    expect(last?.[1]).toBeCloseTo((end.value.latRad * 180) / Math.PI, 9);
    expect(last?.[0]).toBeCloseTo((end.value.lonRad * 180) / Math.PI, 9);
    expect(markers?.collection.features.map((f) => f.properties)).toEqual([
      { kind: 'set-aside-observer', id: hidden.sightingId },
    ]);
    expect(lines?.fit ?? false).toBe(false);
  });

  it('is two empty layers when nothing is set aside, so that a layer drawn before is cleared', () => {
    const m = modelOf(assessed(postsIncident(['west', 'east'])));
    expect(m.layers.map((l) => [l.id, l.collection.features.length])).toEqual([
      ['set-aside', 0],
      ['set-aside-observers', 0],
    ]);
  });

  it('draws the lines 5 000 m long with no Fix, and 1.3 times the farthest used observer otherwise, within [2 000, 500 000] m', () => {
    expect(modelOf(assessed(postsIncident(['west']))).lineLengthM).toBe(5000);
    expect(modelOf(assessed(postsIncident([]))).lineLengthM).toBe(5000);
    const a = assessed(postsIncident(['west', 'east', 'side']));
    const fix = a.fix?.ok ? a.fix.value : null;
    if (fix === null) throw new Error('no Fix');
    const farthest = Math.max(
      ...a.used.map((e) => {
        const d = greatCircleDistanceM(e.sighting.bearing.observer, fix.position);
        return d.ok ? d.value : 0;
      }),
    );
    expect(modelOf(a).lineLengthM).toBeCloseTo(
      Math.min(Math.max(1.3 * farthest, 2000), 500_000),
      9,
    );
  });

  it('clamps the line length at 2 000 m and at 500 000 m', () => {
    const near = assessed(postsIncident(['west', 'east']));
    const fix = near.fix?.ok ? near.fix.value : null;
    if (fix === null) throw new Error('no Fix');
    const moved = (km: number) => {
      const p = destinationPosition(fix.position, 0, km * 1000);
      if (!p.ok) throw new Error('destination');
      return { ...near, fix: { ok: true as const, value: { ...fix, position: p.value } } };
    };
    // The Fix put between the two posts, 800 m from each: 1.3 × 800 m is under the floor.
    const between = { ...near, fix: { ok: true as const, value: { ...fix, position: ORIGIN } } };
    expect(modelOf(between).lineLengthM).toBe(2000);
    expect(modelOf(moved(600)).lineLengthM).toBe(500_000);
  });

  it('with the wind Overlay\u2019s two layers uses four of the layers UI allows', () => {
    const ids = [...SET_ASIDE_LAYER_IDS, ...WIND_LAYER_IDS];
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids.length).toBeLessThanOrEqual(MAX_APP_LAYERS);
  });

  it('shows the set-aside outlier of four-posts-one-wrong on the map', () => {
    const a = assessed(
      postsIncident(['west', 'east', 'side', 'southwest'], (post) =>
        post === 'southwest' ? { errorRad: (12 * Math.PI) / 180 } : {},
      ),
    );
    const m = modelOf(a);
    expect(m.layers[0]?.collection.features.map((f) => f.properties.id)).toEqual([sightingIdOf(4)]);
    expect(m.observers).toHaveLength(3);
  });

  it('fails with invalid_number naming fix for a Fix that carries a number that is not finite (Req 2.1)', () => {
    const a = assessed(postsIncident(['west', 'east']));
    if (!a.fix?.ok) throw new Error('no fix');
    const bad = {
      ...a,
      fix: {
        ok: true as const,
        value: { ...a.fix.value, covariance: { ...a.fix.value.covariance, varEastM2: Number.NaN } },
      },
    };
    expect(mapModel(bad, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'fix',
    });
  });

  it('names the parameter that is not valid', () => {
    expect(
      mapModel(assessed(postsIncident(['west', 'east'])), { ...PARAMETERS, maxCodeLengthChars: 0 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'maxCodeLengthChars',
    });
  });
});
