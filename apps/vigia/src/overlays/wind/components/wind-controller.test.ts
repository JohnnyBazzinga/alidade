// The wind controller (design §7.16, Req 13.1, 13.2, 13.7, 17.4): off at start; a request only when
// the user switches the Overlay on or presses Refresh, never on a timer; a failure shows its
// Message and leaves no layer; new observers or a new Fix recompute the layers with no request; in
// Simulation mode the fixture is read and the gate is not called. The tests run it behind the real
// Network gate and the real Host list, over a fake `fetch`.

import { degToRad, unprojectToLocalPlane, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { createNetworkGate, type FetchLike } from '../../../adapters/network-gate';
import { HOST_LIST } from '../../../math/network/host-list';
import { windRequestUrl } from '../../../math/network/request-boxes';
import { defaultParameters } from '../../../math/parameters';
import { createFakeFetch, type FakeBehaviour } from '../../../test-support/fake-fetch';
import { FakeTimer } from '../../../test-support/fake-timer';
import { createRecordingGate } from '../../../test-support/recording-gate';
import type { OverlayContext, OverlayState } from '../../shared/math/overlay-types';
import FIXTURE_TEXT from '../../../../fixtures/open-meteo-sample.json?raw';
import { createWindController } from './wind-controller';

const PARAMETERS = defaultParameters();
const VALID_UTC_MS = 1_790_000_000_000;
const ORIGIN: Position = (() => {
  const lat = degToRad(30);
  const lon = degToRad(-40);
  if (!lat.ok || !lon.ok) throw new Error('bad origin');
  return { latRad: lat.value, lonRad: lon.value };
})();

function offset(eastM: number, northM: number): Position {
  const p = unprojectToLocalPlane(ORIGIN, { eastM, northM });
  if (!p.ok) throw new Error('bad offset');
  return p.value;
}

/** The two-posts scene: the Fix 3 km north of the origin, observers 800 m west and east. */
const CONTEXT: OverlayContext = {
  observers: [offset(-800, 0), offset(800, 0)],
  fix: offset(0, 3000),
  clearRadiusM: 765,
  lineLengthM: 3953,
};
const NO_FIX: OverlayContext = { ...CONTEXT, fix: null, clearRadiusM: 0 };
const NOTHING: OverlayContext = { observers: [], fix: null, clearRadiusM: 0, lineLengthM: 5000 };

interface Rig {
  readonly controller: ReturnType<typeof createWindController>;
  readonly fetch: ReturnType<typeof createFakeFetch>;
  readonly timer: FakeTimer;
  readonly setNow: (utcMs: number) => void;
  readonly states: OverlayState[];
}

function rig(
  behave: (url: string) => FakeBehaviour = () => ({
    kind: 'text',
    status: 200,
    text: FIXTURE_TEXT,
  }),
  mode: 'device' | 'simulation' = 'device',
): Rig {
  const fetch = createFakeFetch(behave);
  const timer = new FakeTimer();
  const gate = createNetworkGate(fetch.fetchLike, HOST_LIST, PARAMETERS, timer);
  if (!gate.ok) throw new Error('gate');
  let nowUtcMs = VALID_UTC_MS + 5 * 60_000;
  const controller = createWindController({
    gate: gate.value,
    clock: () => nowUtcMs,
    parameters: PARAMETERS,
    mode,
  });
  const states: OverlayState[] = [];
  controller.subscribe(() => states.push(controller.getState()));
  return { controller, fetch, timer, setNow: (t) => (nowUtcMs = t), states };
}

/** Lets the gate's promises settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function urlFor(position: Position): string {
  const u = windRequestUrl(position, PARAMETERS);
  if (!u.ok) throw new Error('url');
  return u.value;
}

describe('off at start (Req 13.1)', () => {
  it('is off, with no layer, no legend, no words, no failure, and has made no request', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    await settle();
    expect(r.controller.getState()).toEqual({
      id: 'wind',
      enabled: false,
      status: 'off',
      failure: null,
      layers: [],
      legend: [],
      words: [],
      fetchedUtcMs: null,
    });
    expect(r.fetch.calls).toEqual([]);
  });

  it('refresh while off asks for nothing', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.refresh();
    await settle();
    expect(r.fetch.calls).toEqual([]);
  });
});

describe('the user\u2019s acts and nothing else make a request (Req 13.7)', () => {
  it('switching on makes one request for the Fix\u2019s rounded point, and Refresh one more', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    expect(r.fetch.calls.map((c) => c.url)).toEqual([urlFor(CONTEXT.fix as Position)]);
    r.controller.refresh();
    await settle();
    expect(r.fetch.calls).toHaveLength(2);
    expect(r.fetch.calls[1]?.url).toBe(r.fetch.calls[0]?.url);
  });

  it('switching on again while on, and an update, and an hour of the timer make none', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    r.controller.setEnabled(true);
    r.controller.update(CONTEXT);
    r.controller.update({ ...CONTEXT, lineLengthM: 9000 });
    r.timer.advance(60 * 60 * 1000);
    await settle();
    expect(r.fetch.calls).toHaveLength(1);
    expect(r.timer.running()).toBe(0);
  });

  it('with no Fix asks for the midpoint of the observers', async () => {
    const r = rig();
    r.controller.update(NO_FIX);
    r.controller.setEnabled(true);
    await settle();
    expect(r.fetch.calls.map((c) => c.url)).toEqual([urlFor(offset(0, 0))]);
  });

  it('sends nothing but the point: the request is exactly the Host list\u2019s own URL for it', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    const call = r.fetch.calls[0];
    expect(call?.url).toMatch(/^https:\/\/[^/]+\/v1\/forecast\?latitude=30\.0&longitude=-40\.0&/);
    expect(call?.init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {},
    });
  });

  it('with no smoke to ask about makes no request, says so, and asks only when Refresh is pressed with one', async () => {
    const r = rig();
    r.controller.update(NOTHING);
    r.controller.setEnabled(true);
    await settle();
    expect(r.fetch.calls).toEqual([]);
    const state = r.controller.getState();
    expect(state).toMatchObject({ enabled: true, status: 'ready', failure: null, layers: [] });
    expect(state.words.join(' ')).toContain('no smoke');
    r.controller.update(CONTEXT);
    await settle();
    expect(r.fetch.calls).toEqual([]);
    r.controller.refresh();
    await settle();
    expect(r.fetch.calls).toHaveLength(1);
    expect(r.controller.getState().layers).toHaveLength(2);
  });
});

describe('a reading (Req 13.3, 13.4, 18.4)', () => {
  it('has the wind\u2019s words, the two layers, the legend entry and the time it was fetched', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    const s = r.controller.getState();
    expect(s).toMatchObject({ enabled: true, status: 'ready', failure: null });
    expect(s.words[0]).toBe(
      'Wind from the south-west (225°) at 4.2 m/s, valid 14:13 UTC (5 min ago).',
    );
    expect(s.words.join(' ')).toContain('model value');
    expect(s.layers.map((l) => l.id)).toEqual(['wind', 'wind-head']);
    expect(s.layers.every((l) => !('fit' in l))).toBe(true);
    expect(s.legend).toHaveLength(1);
    expect(s.legend[0]).toMatchObject({ sourceName: 'Open-Meteo', timeUtcMs: VALID_UTC_MS });
    expect(s.legend[0]?.label).toContain('blows to');
    expect(s.fetchedUtcMs).toBe(VALID_UTC_MS + 5 * 60_000);
  });

  it('through the Loading state first, and tells its subscribers of each change', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    expect(r.states.map((s) => s.status)).toEqual(['loading', 'ready']);
  });

  it('a reading valid for a time more than the maximum age away is said to be old and carries overlay_stale', async () => {
    const r = rig();
    r.setNow(VALID_UTC_MS + PARAMETERS.maxWindAgeMs + 1);
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    const s = r.controller.getState();
    expect(s.words).toContain('This is an old reading, not the wind now.');
    expect(s.failure).toMatchObject({ ok: false, reason: 'overlay_stale' });
    expect(s.layers).toHaveLength(2);
  });

  it('a reading for a time far ahead is said to be a forecast', async () => {
    const r = rig();
    r.setNow(VALID_UTC_MS - PARAMETERS.maxWindAgeMs - 1);
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    expect(r.controller.getState().words.join(' ')).toContain('This is a forecast for 14:13 UTC');
  });
});

describe('a failure shows its Message and leaves the layers empty (Req 12.2, 13.1)', () => {
  it('a request that fails: overlay_unavailable with the cause, no layer, no words', async () => {
    const r = rig(() => ({ kind: 'reject', error: new TypeError('Failed to fetch') }));
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    expect(r.controller.getState()).toMatchObject({
      enabled: true,
      status: 'failed',
      failure: { ok: false, reason: 'overlay_unavailable', errorName: 'offline' },
      layers: [],
      legend: [],
      words: [],
      fetchedUtcMs: null,
    });
  });

  it('a response that is not a wind reading: overlay_unavailable naming the field', async () => {
    const r = rig(() => ({ kind: 'text', status: 200, text: '{"current":{}}' }));
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    expect(r.controller.getState()).toMatchObject({
      status: 'failed',
      failure: { reason: 'overlay_unavailable', field: 'current.time' },
      layers: [],
    });
  });

  it('a failed Refresh removes the reading it had, and a good one brings it back', async () => {
    let fail = false;
    const r = rig(() =>
      fail
        ? { kind: 'text', status: 503, text: '' }
        : { kind: 'text', status: 200, text: FIXTURE_TEXT },
    );
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    expect(r.controller.getState().layers).toHaveLength(2);
    fail = true;
    r.controller.refresh();
    await settle();
    expect(r.controller.getState()).toMatchObject({
      status: 'failed',
      failure: { errorName: 'status-503' },
      layers: [],
    });
    fail = false;
    r.controller.refresh();
    await settle();
    expect(r.controller.getState()).toMatchObject({ status: 'ready', failure: null });
    expect(r.controller.getState().layers).toHaveLength(2);
  });
});

describe('update recomputes the layers and asks for nothing (Req 13.7)', () => {
  it('a new Fix or new lines move the arrow with no request', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    const before = JSON.stringify(r.controller.getState().layers);
    r.controller.update({ ...CONTEXT, fix: offset(0, 3050), lineLengthM: 8000 });
    expect(JSON.stringify(r.controller.getState().layers)).not.toBe(before);
    expect(r.fetch.calls).toHaveLength(1);
  });

  it('with the smoke gone the layers go and the reading stays, with no request', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    r.controller.update(NOTHING);
    expect(r.controller.getState().layers).toEqual([]);
    expect(r.controller.getState().words.length).toBeGreaterThan(0);
    expect(r.fetch.calls).toHaveLength(1);
  });

  it('says so when the smoke has moved to another cell of the grid since the reading, and not within it', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    r.controller.update({ ...CONTEXT, fix: offset(0, 3100) });
    expect(r.controller.getState().words.join(' ')).not.toContain('another place');
    r.controller.update({ ...CONTEXT, fix: offset(0, 30_000) });
    expect(r.controller.getState().words.join(' ')).toContain(
      'The smoke is now in another place than when this reading was asked for; press Refresh for the wind there.',
    );
    expect(r.fetch.calls).toHaveLength(1);
  });
});

describe('switching off (Req 12.1)', () => {
  it('removes the layers and the words, and a reply that arrives afterwards is ignored', async () => {
    let release: () => void = () => undefined;
    const gateReply = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = createFakeFetch(() => ({ kind: 'text', status: 200, text: FIXTURE_TEXT }));
    const slowFetch: FetchLike = async (url, init) => {
      await gateReply;
      return fetch.fetchLike(url, init);
    };
    const timer = new FakeTimer();
    const gate = createNetworkGate(slowFetch, HOST_LIST, PARAMETERS, timer);
    if (!gate.ok) throw new Error('gate');
    const controller = createWindController({
      gate: gate.value,
      clock: () => VALID_UTC_MS,
      parameters: PARAMETERS,
      mode: 'device',
    });
    controller.update(CONTEXT);
    controller.setEnabled(true);
    controller.setEnabled(false);
    release();
    await settle();
    expect(controller.getState()).toMatchObject({
      enabled: false,
      status: 'off',
      layers: [],
      words: [],
      fetchedUtcMs: null,
    });
  });

  it('switching on again makes a new request', async () => {
    const r = rig();
    r.controller.update(CONTEXT);
    r.controller.setEnabled(true);
    await settle();
    r.controller.setEnabled(false);
    r.controller.setEnabled(true);
    await settle();
    expect(r.fetch.calls).toHaveLength(2);
    expect(r.controller.getState().layers).toHaveLength(2);
  });

  it('the newest request wins when two are in flight', async () => {
    const replies: (() => void)[] = [];
    const answers = [
      FIXTURE_TEXT.replace('"wind_speed_10m": 4.2', '"wind_speed_10m": 9.9'),
      FIXTURE_TEXT,
    ];
    let n = 0;
    const timer = new FakeTimer();
    const fetchLike: FetchLike = () => {
      const mine = n;
      n += 1;
      return new Promise((resolve) => {
        replies[mine] = () =>
          resolve({
            ok: true,
            status: 200,
            body: null,
            text: () => Promise.resolve(answers[mine] ?? ''),
          });
      });
    };
    const gate = createNetworkGate(fetchLike, HOST_LIST, PARAMETERS, timer);
    if (!gate.ok) throw new Error('gate');
    const controller = createWindController({
      gate: gate.value,
      clock: () => VALID_UTC_MS,
      parameters: PARAMETERS,
      mode: 'device',
    });
    controller.update(CONTEXT);
    controller.setEnabled(true);
    controller.refresh();
    replies[1]?.();
    await settle();
    replies[0]?.();
    await settle();
    expect(controller.getState().words[0]).toContain('at 4.2 m/s');
  });
});

describe('Simulation mode reads the fixture and never calls the gate (Req 13.1, 17.4)', () => {
  function simulation() {
    const gate = createRecordingGate();
    const controller = createWindController({
      gate,
      clock: () => VALID_UTC_MS + 60_000,
      parameters: PARAMETERS,
      mode: 'simulation',
    });
    return { gate, controller };
  }

  it('switching on gives the fixture\u2019s reading with no key and no call', async () => {
    const { gate, controller } = simulation();
    controller.update(CONTEXT);
    controller.setEnabled(true);
    await settle();
    expect(gate.calls).toEqual([]);
    const s = controller.getState();
    expect(s).toMatchObject({ status: 'ready', failure: null });
    expect(s.words[0]).toBe(
      'Wind from the south-west (225°) at 4.2 m/s, valid 14:13 UTC (1 min ago).',
    );
    expect(s.layers).toHaveLength(2);
    expect(s.fetchedUtcMs).toBe(VALID_UTC_MS + 60_000);
  });

  it('Refresh reads it again and still never calls the gate', async () => {
    const { gate, controller } = simulation();
    controller.update(CONTEXT);
    controller.setEnabled(true);
    controller.refresh();
    await settle();
    expect(gate.calls).toEqual([]);
    expect(controller.getState().status).toBe('ready');
  });
});
