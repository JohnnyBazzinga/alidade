// The simulated phones (design D16, §10; Req 17.1, 17.4, 17.5): one phone for each Station of the
// chosen scene, each with its own store, memory storage and endpoint on one in-memory network; the
// Clock is the largest time any Session has reported, never decreasing; a code goes to another
// phone as text only.

import { describe, expect, it } from 'vitest';
import { smokeScenes } from '../../math/scenes/smoke-scenes';
import { defaultParameters } from '../../math/parameters';
import { createClipboard } from '../../adapters/clipboard';
import { createQrEncoder } from '../../adapters/qr-encoder';
import { createRandom } from '../../adapters/random';
import { captureScene } from '../../test-support/capture-from-script';
import { createFakeCrypto } from '../../test-support/fake-browser';
import { createRecordingGate } from '../../test-support/recording-gate';
import { FakeTimer } from '../../test-support/fake-timer';
import type { SightingSource } from '../environment';
import { createSimulatedPhones, createSimulationClock } from './simulated-phone';

const parameters = defaultParameters();
const built = smokeScenes();
if (!built.ok) throw new Error(built.reason);
const FOUR = built.value.find((s) => s.scene.id === 'four-posts-one-wrong');
const THREE = built.value.find((s) => s.scene.id === 'three-posts');
if (FOUR === undefined || THREE === undefined) throw new Error('scenes');
const FOUR_SCENE = FOUR;
const THREE_SCENE = THREE;
const START_UTC_MS = 1_790_000_000_000;

const qr = createQrEncoder(parameters);
if (!qr.ok) throw new Error('qr');
const QR = qr.value;
const SIGHTING: SightingSource = { kind: 'simulation', render: () => null };

function phonesOf(entry = THREE_SCENE) {
  const timer = new FakeTimer();
  const clock = createSimulationClock(START_UTC_MS);
  const phones = createSimulatedPhones({
    entry,
    clock: clock.now,
    sighting: SIGHTING,
    base: {
      parameters,
      timer,
      random: createRandom(createFakeCrypto()),
      clipboard: createClipboard({}),
      gate: createRecordingGate(),
      qr: QR,
      loadMap: () => new Promise(() => undefined),
      tiles: null,
      tilesFailure: null,
    },
  });
  for (const phone of phones) phone.store.start();
  return { phones, clock, timer };
}

/** The Bearing of a Station of the scene, captured through Sensors from its script. */
function bearingOf(stationId: string, entry = THREE_SCENE) {
  const captured = captureScene(entry, { seed: 1, run: 0 });
  if (!captured.ok) throw new Error(captured.reason);
  const bearing = captured.value.find((b) => b.id === stationId);
  if (bearing === undefined) throw new Error('bearing');
  return bearing;
}

describe('the Clock of the simulation', () => {
  it('starts at the given time', () => {
    expect(createSimulationClock(START_UTC_MS).now()).toBe(START_UTC_MS);
  });

  it('is the largest time any Session reported and never decreases', () => {
    const clock = createSimulationClock(START_UTC_MS);
    clock.report(START_UTC_MS + 5000);
    expect(clock.now()).toBe(START_UTC_MS + 5000);
    clock.report(START_UTC_MS + 2000);
    expect(clock.now()).toBe(START_UTC_MS + 5000);
    clock.report(START_UTC_MS + 5001);
    expect(clock.now()).toBe(START_UTC_MS + 5001);
  });

  it('ignores a time that is not a finite number', () => {
    const clock = createSimulationClock(START_UTC_MS);
    clock.report(Number.NaN);
    clock.report(Number.POSITIVE_INFINITY);
    expect(clock.now()).toBe(START_UTC_MS);
  });
});

describe('createSimulatedPhones', () => {
  it('makes one phone for each Station of the scene, in the scene’s order', () => {
    expect(phonesOf(THREE_SCENE).phones.map((p) => p.stationId)).toEqual(['west', 'east', 'side']);
    expect(phonesOf(FOUR_SCENE).phones.map((p) => p.stationId)).toEqual([
      'west',
      'east',
      'side',
      'southwest',
    ]);
  });

  it('names a phone by its post: "the phone at the east post"', () => {
    const { phones } = phonesOf();
    expect(phones.map((p) => p.label)).toEqual([
      'the phone at the west post',
      'the phone at the east post',
      'the phone at the side post',
    ]);
  });

  it('gives each its own store, memory storage and environment in Simulation mode', () => {
    const { phones } = phonesOf();
    expect(new Set(phones.map((p) => p.store)).size).toBe(3);
    expect(new Set(phones.map((p) => p.environment.storage)).size).toBe(3);
    for (const phone of phones) {
      expect(phone.environment.mode).toBe('simulation');
      expect(phone.environment.storage.persistent).toBe(false);
      expect(phone.environment.sighting).toBe(SIGHTING);
    }
  });

  it('lists the other phones as peers, never itself', () => {
    const { phones } = phonesOf();
    const west = phones[0];
    expect(west?.environment.peers.map((p) => p.id)).toEqual(['east', 'side']);
    expect(west?.environment.peers.map((p) => p.label)).toEqual([
      'the phone at the east post',
      'the phone at the side post',
    ]);
  });

  it('keeps a phone’s sightings to itself', () => {
    const { phones } = phonesOf();
    const [west, east] = phones;
    const made = west?.store.capture(bearingOf('west'), 'new');
    expect(made?.ok).toBe(true);
    expect(west?.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(east?.store.getSnapshot().state.incidents).toHaveLength(0);
  });

  it('makes the Incident id of a smoke begin with Z (Req 17.4)', () => {
    const { phones } = phonesOf();
    phones[0]?.store.capture(bearingOf('west'), 'new');
    const id = phones[0]?.store.getSnapshot().state.openIncidentId;
    expect(id?.startsWith('Z')).toBe(true);
  });

  it('sends a code to the chosen phone alone, as text, into its Inbox', async () => {
    const { phones } = phonesOf();
    const [west, east, side] = phones;
    const made = west?.store.capture(bearingOf('west'), 'new');
    if (made === undefined || !made.ok) throw new Error('capture');
    const peer = west?.environment.peers.find((p) => p.id === 'east');
    if (peer === undefined) throw new Error('peer');
    const code = west?.store.getSnapshot().state.incidents[0]?.entries[0]?.code;
    if (code === undefined) throw new Error('code');
    const sent = await peer.send(code);
    expect(sent.ok).toBe(true);
    expect(east?.store.getSnapshot().inbox.map((i) => i.code)).toEqual([code]);
    expect(side?.store.getSnapshot().inbox).toHaveLength(0);
    expect(west?.store.getSnapshot().inbox).toHaveLength(0);
  });

  it('delivers by the store’s own sendToPeer and records the channel, with no link', async () => {
    const { phones } = phonesOf();
    const west = phones[0];
    const made = west?.store.capture(bearingOf('west'), 'new');
    if (made === undefined || !made.ok) throw new Error('capture');
    const peer = west?.environment.peers[0];
    if (peer === undefined) throw new Error('peer');
    const result = await west?.store.sendToPeer(peer, made.value.sightingId);
    expect(result?.ok).toBe(true);
    const shared = west?.store.getSnapshot().state.incidents[0]?.entries[0]?.shared;
    expect(shared?.map((s) => s.channel)).toEqual(['memory']);
    expect(phones[1]?.store.getSnapshot().inbox).toHaveLength(1);
  });

  it('merges a received code into the other phone as the same smoke on Add', async () => {
    const { phones } = phonesOf();
    const [west, east] = phones;
    west?.store.capture(bearingOf('west'), 'new');
    const incident = west?.store.getSnapshot().state.incidents[0];
    const code = incident?.entries[0]?.code;
    if (incident === undefined || code === undefined) throw new Error('code');
    await west?.environment.peers[0]?.send(code);
    // The east phone does not have that smoke: it joins it.
    const added = east?.store.addFromInbox(code, true);
    expect(added?.ok).toBe(true);
    const joined = east?.store.getSnapshot().state.incidents;
    expect(joined?.map((i) => i.incidentId)).toEqual([incident.incidentId]);
    expect(joined?.[0]?.entries.map((e) => e.sighting.sightingId)).toEqual([
      incident.entries[0]?.sighting.sightingId,
    ]);
    expect(east?.store.getSnapshot().inbox).toHaveLength(0);
  });

  it('stops every store and endpoint on stop()', () => {
    const { phones, timer } = phonesOf();
    expect(timer.running()).toBeGreaterThan(0);
    for (const phone of phones) phone.stop();
    expect(timer.running()).toBe(0);
  });
});
