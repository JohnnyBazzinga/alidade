// The synthetic scenes of the reviewer's path (Req 13.2, 13.3, 13.7; design §10): one UI scene per
// Sight time, with the Sun where the Sun wrapper puts it.

import { createSimulator, declinationAt } from '@alidade/sensors';
import { checkScene, CATALOGUE_ORIGIN } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { sunAt } from '../sun/sun-at';
import { catalogueSceneAt, sunScenes } from './sun-scenes';

const params = defaultParameters();
const D = DEG_TO_RAD;
const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };
const utc = (h: number, m: number) => Date.UTC(2026, 11, 21, h, m);
// The scenes' own constant for the day is a number, not a Date; this is the calendar's check of it.

function scenes() {
  const r = sunScenes(params);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
const byId = (id: string) => {
  const s = scenes().find((x) => x.id === id);
  if (s === undefined) throw new Error(`no scene ${id}`);
  return s;
};

describe('sunScenes', () => {
  it('names the five scenes of design §10, each at the synthetic origin', () => {
    expect(scenes().map((s) => s.id)).toEqual([
      'good-day',
      'too-close',
      'too-close-10min',
      'one-disagrees',
      'uncalibrated',
    ]);
    for (const s of scenes()) expect(s.truth).toEqual(CATALOGUE_ORIGIN);
  });

  it('has the Sight times of the design on 2026-12-21', () => {
    expect(byId('good-day').sightTimesUtcMs).toEqual([utc(11, 40), utc(14, 40), utc(17, 40)]);
    expect(byId('too-close').sightTimesUtcMs).toEqual([utc(13, 0), utc(13, 40)]);
    expect(byId('too-close-10min').sightTimesUtcMs).toEqual([utc(13, 0), utc(13, 10)]);
    expect(byId('one-disagrees').sightTimesUtcMs).toEqual(byId('good-day').sightTimesUtcMs);
    expect(byId('uncalibrated').sightTimesUtcMs).toEqual(byId('good-day').sightTimesUtcMs);
  });

  it('gives every scene the phone’s bias of -3.3°', () => {
    for (const s of scenes()) expect(s.altitudeBiasRad).toBeCloseTo(-3.3 * D, 12);
  });

  it('gives scenes (a) to (c) an Index error marked simulated, and (d) none', () => {
    for (const id of ['good-day', 'too-close', 'too-close-10min', 'one-disagrees']) {
      const ie = byId(id).indexError;
      expect(ie?.simulated).toBe(true);
      expect(ie?.valueRad).toBeCloseTo(-3.2 * D, 12);
      expect(ie?.sigmaRad).toBeCloseTo(0.25 * D, 12);
    }
    expect(byId('uncalibrated').indexError).toBeNull();
  });

  it('adds the error to one Sight of scene (c) only', () => {
    const added = byId('one-disagrees').addedErrorRad;
    expect(Object.keys(added)).toEqual(['1']);
    expect(added[1]).toBeGreaterThanOrEqual(3 * D);
    expect(byId('good-day').addedErrorRad).toEqual({});
  });
});

describe('catalogueSceneAt', () => {
  for (const scene of scenes()) {
    scene.sightTimesUtcMs.forEach((time, k) => {
      describe(`${scene.id}, Sight time ${k + 1}`, () => {
        const built = catalogueSceneAt(scene, k, params);
        if (!built.ok) throw new Error(built.reason);
        const cs = built.value;

        it('is a valid scene of the altitude kind with one Station per Sight time and the Sun as target', () => {
          expect(checkScene(cs.scene).ok).toBe(true);
          expect(cs.kind).toBe('altitude');
          expect(cs.scene.stations).toHaveLength(scene.sightTimesUtcMs.length);
          expect(cs.scene.targets.map((t) => t.kind)).toEqual(['sun']);
          expect(cs.aimTargetId).toBe('sun');
        });

        it('puts the Sun where the Sun wrapper puts it at the Sight time, within 1e-12 rad', () => {
          const sun = sunAt(scene.truth, time, params);
          if (!sun.ok) throw new Error(sun.reason);
          const target = cs.scene.targets[0];
          if (target?.kind !== 'sun') throw new Error('no sun');
          expect(Math.abs(target.azimuthRad - sun.value.trueAzimuthRad)).toBeLessThan(1e-12);
          expect(Math.abs(target.apparentAltitudeRad - sun.value.apparentAltitudeRad)).toBeLessThan(
            1e-12,
          );
          expect(target.angularRadiusRad).toBeCloseTo(0.267 * D, 9);
        });

        it('has scripts that start 500 ms before their Sight time with the Declination there, and the Simulator accepts them', () => {
          scene.sightTimesUtcMs.forEach((t, j) => {
            const station = cs.scene.stations[j];
            const script = station === undefined ? undefined : cs.scripts[station.id];
            if (script === undefined) throw new Error('no script');
            expect(script.startUtcMs).toBe(t - 500);
            const dec = declinationAt(scene.truth, t - 500);
            if (!dec.ok) throw new Error(dec.reason);
            expect(script.declinationRad).toBe(dec.value.declinationRad);
            const expectedBias = scene.altitudeBiasRad + (scene.addedErrorRad[j] ?? 0);
            expect(script.altitudeBiasRad).toBeCloseTo(expectedBias, 12);
            expect(script.orientationNoiseSigmaRad).toBeCloseTo(0.05 * D, 12);
            expect(script.frame.kind).toBe('absolute');
            expect(createSimulator(script, 1, OPTIONS).ok).toBe(true);
          });
        });

        it('names the Station of this Sight time', () => {
          expect(cs.scene.stations[k]?.name).toBe(
            `Sight ${k + 1}, ${new Date(time).toISOString().slice(11, 16)} UTC`,
          );
        });
      });
    });
  }

  it('scripts the scene’s own orientation noise, so that a copy with none gives scripts with none', () => {
    const quiet = catalogueSceneAt({ ...byId('good-day'), orientationNoiseSigmaRad: 0 }, 0, params);
    if (!quiet.ok) throw new Error(quiet.reason);
    for (const script of Object.values(quiet.value.scripts))
      expect(script.orientationNoiseSigmaRad).toBe(0);
  });

  it('refuses an index outside the Sight times and parameters that are not valid', () => {
    const scene = byId('good-day');
    for (const bad of [-1, 3, 1.5, Number.NaN])
      expect(catalogueSceneAt(scene, bad, params).ok).toBe(false);
    expect(catalogueSceneAt(scene, 0, { ...params, minSightAltitudeRad: Number.NaN }).ok).toBe(
      false,
    );
  });

  it('refuses a scene whose time the Sun wrapper cannot use', () => {
    const scene = { ...byId('good-day'), sightTimesUtcMs: [0, 1] };
    expect(catalogueSceneAt(scene, 0, params).ok).toBe(false);
  });
});
