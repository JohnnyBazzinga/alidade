// The four Synthetic scenes of the reviewer's path (design §10, Req 17.2, 17.8): each passes UI's
// scene validation and the Simulator's script validation, has the Target "Smoke column", and gives
// through `assess` the class, the semi-axes and the set-aside cause the design's probe measured.
// Semi-axes are the probe's within 10 % (the probe used 2.1 degrees exactly; the scenes' Bearings
// carry Sensors' own sigma). Every position is synthetic: an offset in metres from 30° N, 40° W.

import { projectToLocalPlane, ellipse95 } from '@alidade/core';
import { createSimulator } from '@alidade/sensors';
import { CATALOGUE_ORIGIN, checkScene } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { assess, type Assessment } from '../assessment/assess';
import { geometryClass } from '../fix/geometry-class';
import { defaultParameters } from '../parameters';
import { captureScene } from '../../test-support/capture-from-script';
import { entryOfBearing, incidentOfEntries } from '../../test-support/geometry-fixtures';
import { NOW_UTC_MS, sightingIdOf } from '../../test-support/incident-fixtures';
import { rad } from '../../test-support/sighting-fixture';
import { smokeScenes } from './smoke-scenes';

const PARAMETERS = defaultParameters();
const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

const built = smokeScenes();
if (!built.ok) throw new Error(`smokeScenes failed: ${built.reason} ${built.field ?? ''}`);
const SCENES = built.value;
const scene = (id: string) => {
  const found = SCENES.find((s) => s.scene.id === id);
  if (found === undefined) throw new Error(`no scene ${id}`);
  return found;
};

/** The probe's Fix on exact Bearings with a 2.1 degree sigma (design §10), semi-axes at 95 %. */
const PROBE = {
  'two-posts': { majorM: 765, minorM: 204, geometry: 'poor', warning: false },
  'three-posts': { majorM: 262, minorM: 204, geometry: 'good', warning: false },
  'almost-in-line': { majorM: 8635, minorM: 241, geometry: 'poor', warning: true },
} as const;

/**
 * Assesses the posts of a scene, each Station one Sighting (numbered from 1 in the Station order)
 * at its scripted north error unless `errorsRad` replaces it.
 */
function assessScene(id: string, errorsRad: Readonly<Record<string, number>> = {}): Assessment {
  const entry = scene(id);
  const captured = captureScene(entry, {
    seed: 7,
    run: 0,
    northErrorRadOf: (stationId) => errorsRad[stationId] ?? null,
  });
  if (!captured.ok) throw new Error(`capture failed: ${captured.reason} ${captured.field ?? ''}`);
  const incident = incidentOfEntries(captured.value.map((b, i) => entryOfBearing(i + 1, b)));
  const assessed = assess(incident, NOW_UTC_MS, PARAMETERS);
  if (!assessed.ok) throw new Error(`assess failed: ${assessed.reason}`);
  return assessed.value;
}

describe('the four scenes (Req 17.2)', () => {
  it('are two-posts, three-posts, four-posts-one-wrong and almost-in-line, in that order', () => {
    expect(SCENES.map((s) => s.scene.id)).toEqual([
      'two-posts',
      'three-posts',
      'four-posts-one-wrong',
      'almost-in-line',
    ]);
  });

  it('each has the Stations of design §10 at their offsets from the origin 30° N, 40° W', () => {
    const expected: Record<string, Record<string, [number, number]>> = {
      'two-posts': { west: [-800, 0], east: [800, 0] },
      'three-posts': { west: [-800, 0], east: [800, 0], side: [3100, 3000] },
      'four-posts-one-wrong': {
        west: [-800, 0],
        east: [800, 0],
        side: [3100, 3000],
        southwest: [-2500, -500],
      },
      'almost-in-line': { front: [0, 0], back: [420, -3000] },
    };
    for (const [id, stations] of Object.entries(expected)) {
      const found = scene(id).scene.stations;
      expect(found.map((s) => s.id)).toEqual(Object.keys(stations));
      for (const station of found) {
        const local = projectToLocalPlane(CATALOGUE_ORIGIN, station.position);
        if (!local.ok) throw new Error('project');
        const want = stations[station.id];
        expect(local.value.eastM).toBeCloseTo(want?.[0] ?? Number.NaN, 3);
        expect(local.value.northM).toBeCloseTo(want?.[1] ?? Number.NaN, 3);
      }
    }
  });

  it('each has the Target "Smoke column" 3 000 m north of the origin, 100 m high, and is aimed at it', () => {
    for (const entry of SCENES) {
      const target = entry.scene.targets.find((t) => t.id === 'smoke');
      expect(target?.kind).toBe('landmark');
      if (target === undefined || target.kind !== 'landmark') throw new Error('smoke');
      expect(target.label).toBe('Smoke column');
      expect(target.heightM).toBe(100);
      const local = projectToLocalPlane(CATALOGUE_ORIGIN, target.position);
      if (!local.ok) throw new Error('project');
      expect(local.value.eastM).toBeCloseTo(0, 3);
      expect(local.value.northM).toBeCloseTo(3000, 3);
      expect(entry.aimTargetId).toBe('smoke');
      expect(entry.kind).toBe('bearing');
      expect(entry.failure).toBeNull();
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('each passes UI’s checkScene and a Simulator is created for every Station', () => {
    for (const entry of SCENES) {
      expect(checkScene(entry.scene).ok).toBe(true);
      expect(Object.keys(entry.scripts)).toEqual(entry.scene.stations.map((s) => s.id));
      for (const station of entry.scene.stations) {
        const script = entry.scripts[station.id];
        if (script === undefined) throw new Error(`no script for ${station.id}`);
        const sim = createSimulator(script, 1, SIMULATOR_OPTIONS);
        expect(sim.ok).toBe(true);
      }
    }
  });

  it('keeps the catalogue’s orientation noise of 0.05° and an Absolute frame', () => {
    for (const entry of SCENES) {
      for (const script of Object.values(entry.scripts)) {
        expect(script.orientationNoiseSigmaRad).toBeCloseTo(rad(0.05), 12);
        expect(script.frame.kind).toBe('absolute');
      }
    }
  });

  it('gives only southwest of four-posts-one-wrong a north error: 12°', () => {
    for (const entry of SCENES) {
      for (const [id, script] of Object.entries(entry.scripts)) {
        if (script.frame.kind !== 'absolute') throw new Error('frame');
        const wrong = entry.scene.id === 'four-posts-one-wrong' && id === 'southwest';
        expect(script.frame.northErrorRad).toBeCloseTo(wrong ? rad(12) : 0, 12);
      }
    }
  });

  it('keeps every position within 6 km of the origin (nothing but offsets from it)', () => {
    for (const entry of SCENES) {
      for (const station of entry.scene.stations) {
        const local = projectToLocalPlane(CATALOGUE_ORIGIN, station.position);
        if (!local.ok) throw new Error('project');
        expect(Math.hypot(local.value.eastM, local.value.northM)).toBeLessThan(6000);
      }
    }
  });
});

describe('the scenes through assess (Req 17.2, design §10 probe)', () => {
  for (const [id, probe] of Object.entries(PROBE)) {
    it(`${id}: Fix of the class and semi-axes of the probe, nothing set aside`, () => {
      const assessment = assessScene(id);
      expect(assessment.setAside).toEqual([]);
      const fix = assessment.fix;
      if (fix === null || !fix.ok) throw new Error('no fix');
      const e95 = ellipse95(fix.value.ellipse);
      if (!e95.ok) throw new Error('ellipse95');
      expect(Math.abs(e95.value.semiMajorM / probe.majorM - 1)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(e95.value.semiMinorM / probe.minorM - 1)).toBeLessThanOrEqual(0.1);
      const geometry = geometryClass(fix.value, PARAMETERS);
      expect(geometry).toEqual({ ok: true, value: probe.geometry });
      expect(fix.value.warnings.includes('poor_geometry')).toBe(probe.warning);
    });
  }

  it('four-posts-one-wrong: southwest is set aside as outlier, the Fix is of the other three', () => {
    const assessment = assessScene('four-posts-one-wrong');
    expect(assessment.setAside.map((s) => [s.entry.sighting.sightingId, s.cause])).toEqual([
      [sightingIdOf(4), 'outlier'],
    ]);
    expect(assessment.used.map((u) => u.sighting.sightingId)).toEqual([
      sightingIdOf(1),
      sightingIdOf(2),
      sightingIdOf(3),
    ]);
    const fix = assessment.fix;
    if (fix === null || !fix.ok) throw new Error('no fix');
    const target = scene('four-posts-one-wrong').scene.targets.find((t) => t.id === 'smoke');
    if (target === undefined || target.kind !== 'landmark') throw new Error('smoke');
    const off = projectToLocalPlane(fix.value.position, target.position);
    if (!off.ok) throw new Error('project');
    expect(Math.hypot(off.value.eastM, off.value.northM)).toBeLessThan(300);
  });

  it('the same 12° on side and none on southwest sets nothing aside (the limit of Req 5.4)', () => {
    const assessment = assessScene('four-posts-one-wrong', { side: rad(12), southwest: 0 });
    expect(assessment.setAside).toEqual([]);
    expect(assessment.used).toHaveLength(4);
  });
});
