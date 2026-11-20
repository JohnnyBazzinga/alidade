// What the Map screen gives UI's MapView (Req 9.4, 9.5, 11.4; design D16).

import { CATALOGUE_ORIGIN, MAX_APP_LAYERS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { assess, type Assessment } from './assess';
import { compare } from './comparison';
import { mapModel } from './map-model';

const D = DEG_TO_RAD;
const params = defaultParameters();
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];
const IE = {
  valueRad: -3.3 * D,
  sigmaRad: 0.25 * D,
  sightCount: 3,
  measuredUtcMs: T[2] ?? 0,
  simulated: false,
};

function assessed(times: number[], sunSide: boolean, indexError = IE): Assessment {
  const sights = noiseFreeSights(CATALOGUE_ORIGIN, times, -3.3 * D, sunSide, params);
  const r = assess(sights, indexError, null, params);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function model(a: Assessment, gps = null as Parameters<typeof mapModel>[1]) {
  const r = mapModel(a, gps, params);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

const kindsOf = (m: ReturnType<typeof model>, layer: string): string[] =>
  (m.layers.find((l) => l.id === layer)?.collection.features ?? []).map((f) => f.properties.kind);

describe('mapModel', () => {
  it('has at most five layers, well under UI’s limit, with stable ids', () => {
    const m = model(assessed(T, true));
    expect(m.layers.map((l) => l.id)).toEqual([
      'circles-used',
      'circles-set-aside',
      'places-area',
      'places-point',
      'gps',
    ]);
    expect(m.layers.length).toBeLessThanOrEqual(5);
    expect(m.layers.length).toBeLessThanOrEqual(MAX_APP_LAYERS);
  });

  it('gives the Fix only as `fix`, with one arc per used Sight near it, and no places', () => {
    const a = assessed(T, true);
    if (a.kind !== 'fix') throw new Error(a.kind);
    const m = model(a);
    expect(m.fix).toBe(a.fix);
    expect(kindsOf(m, 'circles-used')).toEqual(['circle-used', 'circle-used', 'circle-used']);
    expect(kindsOf(m, 'places-area')).toEqual([]);
    expect(kindsOf(m, 'places-point')).toEqual([]);
  });

  it('draws Two places as renamed fixFeatures features and no `fix`', () => {
    const a = assessed([T[0] ?? 0, T[2] ?? 0], false);
    if (a.kind !== 'two_places') throw new Error(a.kind);
    const m = model(a);
    expect(m.fix).toBeNull();
    expect(kindsOf(m, 'places-point')).toEqual(['place-point', 'place-point']);
    expect(kindsOf(m, 'places-area')).toEqual(['place-area', 'place-area']);
    const ids = (m.layers.find((l) => l.id === 'places-point')?.collection.features ?? []).map(
      (f) => f.id,
    );
    expect(ids).toEqual(['place-A', 'place-B']);
    const all = m.layers.flatMap((l) => l.collection.features.map((f) => f.properties.kind));
    expect(all).not.toContain('fix');
    expect(all).not.toContain('fix-ellipse-95');
  });

  it('draws the GPS marker in its own layer and never as the Fix', () => {
    const a = assessed(T, true);
    if (a.kind !== 'fix') throw new Error(a.kind);
    const c = compare(a.fix, CATALOGUE_ORIGIN, params);
    if (!c.ok) throw new Error(c.reason);
    const m = model(a, c.value);
    expect(kindsOf(m, 'gps')).toEqual(['gps']);
    expect(m.fix).toBe(a.fix);
  });

  it('draws set-aside Circles apart from the used ones', () => {
    const low = noiseFreeSights(CATALOGUE_ORIGIN, T, -3.3 * D, true, params).map((s, i) =>
      i === 0 ? { ...s, rawApparentAltitudeRad: 0.5 * D } : s,
    );
    const r = assess(low, IE, null, params);
    if (!r.ok) throw new Error(r.reason);
    const m = model(r.value);
    expect(kindsOf(m, 'circles-set-aside')).toEqual(['circle-set-aside']);
    expect(kindsOf(m, 'circles-used').length).toBe(2);
  });

  it('draws nothing for no sight or one sight (the circle is in words only)', () => {
    for (const times of [[], [T[0] ?? 0]]) {
      const m = model(assessed(times, true));
      expect(m.fix).toBeNull();
      expect(m.layers.every((l) => l.collection.features.length === 0)).toBe(true);
    }
  });

  it('refuses parameters that are not valid', () => {
    expect(mapModel(assessed(T, true), null, { ...params, circleArcStepRad: Number.NaN }).ok).toBe(
      false,
    );
  });
});
