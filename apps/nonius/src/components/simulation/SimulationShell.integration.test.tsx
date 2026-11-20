// The reviewer's path (design §10; Req 13.3 to 13.6, 8.2, 9.3, 11.5, 15.7): with a fake Timer, a
// fake map and a memory storage, a reviewer on a laptop runs each scene to its expected end, with
// no network request and no Sensor source asked for a position.

import { greatCircleDistanceM } from '@alidade/core';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../adapters/storage';
import { defaultParameters } from '../../math/parameters';
import { sunAt } from '../../math/sun/sun-at';
import { featuresOf } from '../../test-support/fake-maplibre';
import {
  mountSimulation,
  noiseFreeCopy,
  scenesOfTheApp,
} from '../../test-support/simulation-driver';

const params = defaultParameters();

async function runScene(id: string) {
  const m = mountSimulation();
  await m.choose('Scene', id);
  const n = Number((m.text('phone-bar').match(/of (\d)/) ?? [])[1]);
  for (let i = 0; i < n; i += 1) {
    await m.sight();
    if (i < n - 1) await m.nextSightTime();
  }
  return m;
}

describe('the reviewer’s path, scene by scene', () => {
  it('(a) a good day: a Fix chosen by the Sun side with two sights; with three, a good Fix, the check of three and the advice', async () => {
    const m = mountSimulation();
    await m.sight();
    expect(m.text('fix-screen')).toContain('With one sight you are somewhere on a circle');
    await m.nextSightTime();
    await m.sight();
    expect(m.text('fix-screen')).toMatch(/Chosen by the compass: at the other place/);
    expect(m.text('fix-screen')).toContain('two sights cannot check each other');
    await m.nextSightTime();
    await m.sight();
    const fix = m.text('fix-screen');
    expect(fix).toMatch(/Probably within about \d+ km/);
    expect(fix).toContain('Index error −3.2°');
    expect(fix).toContain('(simulated)');
    expect(fix).toMatch(/The geometry is (good|fair)/);
    expect(fix).toContain('With three sights, they can be seen to disagree');
    expect(fix).toMatch(/Advice: next sight|will not change enough before it sets/);
    expect(fix).not.toContain('never calibrated');
  });

  it('(a) draws the arcs, the Fix and its ellipse on the map, and compares with the scene’s true position', async () => {
    const m = await runScene('good-day');
    await m.click(/Compare with this phone/);
    expect(m.text('comparison')).toMatch(/scene.s true position \(simulated\)/);
    expect(m.text('comparison')).toMatch(/inside the 95 % area/);
    await m.tab('Map');
    await m.settle();
    await m.settle(() => m.lib.last().fire('load'));
    const map = m.lib.last();
    expect(
      featuresOf(map, 'fix')
        .map((f) => f.properties.kind)
        .sort(),
    ).toEqual(['fix', 'fix-ellipse-95']);
    expect(featuresOf(map, 'app-circles-used').length).toBeGreaterThanOrEqual(3);
    expect(featuresOf(map, 'app-gps')).toHaveLength(1);
  });

  it('(b) sights too close in time: a poor Fix and the advice', async () => {
    const m = await runScene('too-close');
    const fix = m.text('fix-screen');
    expect(fix).toContain('The geometry is poor');
    expect(fix).toMatch(/Advice: next sight in about/);
  });

  it('(b) ten minutes apart: no position, and the rule of thumb', async () => {
    const m = await runScene('too-close-10min');
    const fix = m.text('fix-screen');
    expect(fix).toContain('uncertain by more than 2 000 km');
    expect(fix).not.toContain('Probably within');
    expect(fix).toContain('must change by at least 20°');
  });

  it('(c) one sight disagrees: the disagreement is said first, and the Fix is the best fit', async () => {
    const m = await runScene('one-disagrees');
    const fix = m.text('fix-screen');
    expect(fix).toContain('The sights do not agree');
    expect(fix).toContain('The best fit of sights that disagree is');
    expect(fix).not.toContain('Probably within');
    expect(fix.indexOf('The sights do not agree')).toBeLessThan(fix.indexOf('The best fit'));
  });

  it('(d) an uncalibrated phone: the words before the Fix, over 1 000 km wide; measuring the index error shrinks it', async () => {
    const m = await runScene('uncalibrated');
    const before = m.text('fix-screen');
    expect(before).toContain('never calibrated');
    expect(before.indexOf('never calibrated')).toBeLessThan(before.indexOf('Probably within'));
    const wide = /semi-axes of about (\d+) km/.exec(before);
    expect(Number(wide?.[1])).toBeGreaterThan(1000);

    await m.click('Measure the index error');
    await m.click("Use this phone's location");
    await m.press('start');
    await m.ticks(12);
    await m.press('freeze');
    await m.press('capture');
    expect(m.text('index-error-preview')).toMatch(/Index error −3\.[23]° ±/);
    await m.click('Save');
    const after = m.text('fix-screen');
    expect(after).not.toContain('never calibrated');
    expect(after).toMatch(/Index error −3\.[23]° ± \d\.\d°, measured 21 Dec 2026 \(simulated\)/);
    const narrow = /semi-axes of about (\d+) km/.exec(after);
    expect(Number(narrow?.[1])).toBeLessThan(Number(wide?.[1]) / 2);
  });
});

describe('the noise-free copy of scene (a) (Req 13.6)', () => {
  it('captures the Sun’s apparent altitude plus the bias to 1e-8 rad, and the Fix is within 2 km of the truth', async () => {
    const scenes = noiseFreeCopy(scenesOfTheApp()).filter((s) => s.id === 'good-day');
    const storage = createMemoryStorage();
    const m = mountSimulation({ scenes, storage });
    const scene = scenes[0];
    if (scene === undefined) throw new Error('no scene');
    for (let i = 0; i < 3; i += 1) {
      await m.sight();
      if (i < 2) await m.nextSightTime();
    }
    const read = storage.read();
    const stored = JSON.parse(read.ok && read.value !== null ? read.value : '{}') as {
      sights: { timeUtcMs: number; rawApparentAltitudeRad: number }[];
    };
    expect(stored.sights).toHaveLength(3);
    stored.sights.forEach((s, k) => {
      const t = scene.sightTimesUtcMs[k] ?? 0;
      const sun = sunAt(scene.truth, t, params);
      if (!sun.ok) throw new Error(sun.reason);
      const expected = sun.value.apparentAltitudeRad + scene.altitudeBiasRad;
      expect(Math.abs(s.rawApparentAltitudeRad - expected)).toBeLessThan(1e-8);
      expect(s.timeUtcMs - t).toBeGreaterThanOrEqual(-1000);
      expect(s.timeUtcMs - t).toBeLessThanOrEqual(1000);
    });
    const text = m.text('fix-screen');
    const found = /of (\d+(?:\.\d+)?)° ([NS]), (\d+(?:\.\d+)?)° ([EW])\./.exec(text);
    if (found === null) throw new Error(`no position in: ${text}`);
    const latRad = (Number(found[1]) * (found[2] === 'S' ? -1 : 1) * Math.PI) / 180;
    const lonRad = (Number(found[3]) * (found[4] === 'W' ? -1 : 1) * Math.PI) / 180;
    const distance = greatCircleDistanceM(scene.truth, { latRad, lonRad });
    if (!distance.ok) throw new Error(distance.reason);
    expect(distance.value).toBeLessThan(2000);
  });
});

describe('no network', () => {
  it('makes no request with no tile source, whatever the reviewer does: fetch, XMLHttpRequest, WebSocket, EventSource and sendBeacon are never called', async () => {
    const calls: string[] = [];
    const spy = (name: string) =>
      function recorded() {
        calls.push(name);
        throw new Error(`${name} was called`);
      };
    vi.stubGlobal('fetch', spy('fetch'));
    vi.stubGlobal('XMLHttpRequest', spy('XMLHttpRequest'));
    vi.stubGlobal('WebSocket', spy('WebSocket'));
    vi.stubGlobal('EventSource', spy('EventSource'));
    Object.defineProperty(navigator, 'sendBeacon', {
      value: spy('sendBeacon'),
      configurable: true,
    });
    try {
      const m = await runScene('good-day');
      await m.click(/Compare with this phone/);
      await m.tab('Map');
      await m.settle(() => m.lib.last().fire('load'));
      expect(m.text('map-legend')).toContain('no tile server is asked for anything');
      expect(calls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'sendBeacon');
    }
  });

  it('the recording check bites: a call of fetch is recorded', () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', () => void calls.push('fetch'));
    try {
      void fetch('https://example.test');
      expect(calls).toEqual(['fetch']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
