// The wind Overlay's definition and its place in the registry (design D15, §7.16, §7.18; Req 1.10,
// 13.1, 13.7): what it says before it is switched on, its Source, and the layers it adds to the
// map's eight.

import { degToRad, unprojectToLocalPlane, type Position } from '@alidade/core';
import { MAX_APP_LAYERS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { SET_ASIDE_LAYER_IDS } from '../../../math/fix/map-model';
import { WIND_ENTRY } from '../../../math/network/host-list';
import { defaultParameters } from '../../../math/parameters';
import { OVERLAYS } from '../../index';
import { createRecordingGate } from '../../../test-support/recording-gate';
import { WIND_LAYER_IDS } from '../math/wind-features';
import { WIND_DEFINITION } from './wind-definition';

const ORIGIN: Position = (() => {
  const lat = degToRad(30);
  const lon = degToRad(-40);
  if (!lat.ok || !lon.ok) throw new Error('bad origin');
  return { latRad: lat.value, lonRad: lon.value };
})();

describe('the wind definition (Req 13.1, 13.7)', () => {
  it('is named Wind, and before the first use says to whom, what and when, from the Host list', () => {
    expect(WIND_DEFINITION.id).toBe('wind');
    expect(WIND_DEFINITION.title).toBe('Wind');
    const sends = WIND_DEFINITION.sends;
    expect(sends).toContain(WIND_ENTRY.sourceName);
    expect(sends).toContain(WIND_ENTRY.host);
    expect(sends).toContain(WIND_ENTRY.carries);
    expect(sends).toMatch(/network address/);
    expect(sends).toMatch(/switch it on/i);
    expect(sends).toMatch(/Refresh/);
    expect(sends).toMatch(/never by itself/);
  });

  it('names its Source with the attribution (CC BY 4.0) and the terms of the Host list', () => {
    expect(WIND_DEFINITION.sources).toEqual([
      {
        name: WIND_ENTRY.sourceName,
        attribution: WIND_ENTRY.attribution,
        termsUrl: WIND_ENTRY.termsUrl,
      },
    ]);
    expect(WIND_DEFINITION.sources[0]?.attribution).toContain('CC BY 4.0');
  });

  it('makes a controller that is off', () => {
    const controller = WIND_DEFINITION.create({
      gate: createRecordingGate(),
      clock: () => 0,
      parameters: defaultParameters(),
      mode: 'device',
    });
    expect(controller.getState().status).toBe('off');
  });
});

describe('the registry (D15, Req 1.10)', () => {
  it('holds the wind Overlay alone in the first release', () => {
    expect(OVERLAYS.map((o) => o.id)).toEqual(['wind']);
  });

  it('adds two layers to the model\u2019s two: four of the eight UI allows, held by summing the real ids', () => {
    const controller = WIND_DEFINITION.create({
      gate: createRecordingGate(),
      clock: () => 1_790_000_000_000,
      parameters: defaultParameters(),
      mode: 'simulation',
    });
    const fix = unprojectToLocalPlane(ORIGIN, { eastM: 0, northM: 3000 });
    if (!fix.ok) throw new Error('fix');
    controller.update({
      observers: [ORIGIN],
      fix: fix.value,
      clearRadiusM: 700,
      lineLengthM: 4000,
    });
    controller.setEnabled(true);
    const ids = [...SET_ASIDE_LAYER_IDS, ...controller.getState().layers.map((l) => l.id)];
    expect(ids).toEqual([...SET_ASIDE_LAYER_IDS, ...WIND_LAYER_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
    expect(ids.length).toBeLessThanOrEqual(MAX_APP_LAYERS);
  });
});
