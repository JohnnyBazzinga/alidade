// The store of the app (design D3, D4, D7; Req 2.5, 4.4, 4.5, 9.4, 10.3): the one place that runs
// the effects of the pure reducer. It holds the state, the Inbox (memory only, never stored), the
// notices the screens show, and the assessment and the advice of the open Incident. `assess` and
// Core's `solve` run once for a change of the Sighting set, or when time crosses a limit of the
// assessment, never on a render (the lead's decision 4: a worst-case solve can take a second).
//
// Every effect is injected through the environment: the storage is written after a change, the
// expiry is one Timer tick every `expiryCheckIntervalMs`, a code that reaches the phone from any
// channel (a paste, the page's fragment, the Transport) is decoded into the Inbox, and the page's
// address is replaced once a code has been read from it. Nothing here sends a code anywhere but
// `sendToPeer`, which the Share sheet calls on the user's act.

import type { Bearing, Position } from '@alidade/core';
import type { TimerHandle } from '@alidade/ui';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { assess, type Assessment } from '../math/assessment/assess';
import { extractSightingCode } from '../math/code/code-link';
import { decodeSighting } from '../math/code/sighting-code';
import { nextSightingAdvice, type Advice } from '../math/fix/advice';
import { applyAction, type VigiaAction } from '../math/incident/apply-action';
import { incidentIdFromBytes, incidentMode } from '../math/incident/ids';
import {
  emptyState,
  type InboxItem,
  type Incident,
  type ShareChannel,
  type VigiaState,
} from '../math/incident/incident-state';
import { captureToSighting, type Sighting } from '../math/incident/sighting';
import { parseStoredState, serialiseState } from '../math/incident/storage-format';
import type { TransportStatus, Unsubscribe } from '../math/transport/transport';
import type { VigiaReason } from '../reasons';
import { err, ok, type VigiaFailure, type VigiaResult } from '../result';
import type { SimulationPeer, VigiaEnvironment } from './environment';

/** A notice the Smoke screen shows until the app is reloaded; one per reason. */
export interface ScreenNotice {
  readonly reason: VigiaReason;
  /** How many saved sightings were left out (`storage_corrupt`). */
  readonly count?: number;
}

/** The open Incident with what the store computed for it. */
export interface OpenView {
  readonly incident: Incident;
  readonly assessment: VigiaResult<Assessment>;
  /** `null` when the assessment failed. */
  readonly advice: VigiaResult<Advice> | null;
}

/** Where this phone stood for its newest own sighting, with that sighting's accuracy. */
export interface OwnPosition {
  readonly position: Position;
  readonly accuracyM: number;
}

export interface VigiaSnapshot {
  readonly state: VigiaState;
  readonly inbox: readonly InboxItem[];
  readonly notices: readonly ScreenNotice[];
  /** The Clock's time at the last change or tick: the ages on the screens are counted from it. */
  readonly nowUtcMs: number;
  readonly open: OpenView | null;
  readonly ownPosition: OwnPosition | null;
  /** The page's address still holds a code that was read from it (the history and the location refused). */
  readonly addressHoldsCode: boolean;
  /** The last code that arrived by a link or the Transport and could not be read. */
  readonly receiveFailure: VigiaFailure | null;
  /** How many times a code arrived in the page's fragment: the App opens the Inbox sheet. */
  readonly linkArrivals: number;
  readonly transportStatus: TransportStatus;
  /** Shares recorded since the page was opened: the Share sheet states what a code holds in full before the first (Req 15.2). */
  readonly sharesThisSession: number;
}

export interface VigiaStore {
  getSnapshot(): VigiaSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  /** Loads the storage, reads the fragment, starts the expiry and listens to the Transport. */
  start(): void;
  stop(): void;
  dispatch(action: VigiaAction): VigiaResult<void>;
  /** Adds a captured Bearing after the user's answer (Req 4.3): to the open smoke, or a new one. */
  capture(bearing: Bearing, answer: 'same' | 'new'): VigiaResult<Sighting>;
  /** Decodes a pasted link or code into the Inbox. */
  paste(text: string): VigiaResult<InboxItem>;
  /** "Add" on an Inbox card; `joinIfUnknown` is "Open it as a new smoke on this phone". */
  addFromInbox(code: string, joinIfUnknown: boolean): VigiaResult<void>;
  /** "Ignore" on an Inbox card. */
  ignore(code: string): void;
  /** Records a share by one channel (Req 15.5), after the user's act succeeded. */
  markShared(sightingId: string, channel: ShareChannel): VigiaResult<void>;
  /** Sends a Sighting's code to another simulated phone, as text (Req 17.4, 17.5). */
  sendToPeer(peer: SimulationPeer, sightingId: string): Promise<VigiaResult<void>>;
}

/** The channels that would carry a simulated smoke out of the page (Req 17.4). */
const OUTWARD_CHANNELS: readonly ShareChannel[] = ['link', 'qr', 'system_share'];

/** Two bytes a symbol: 9 symbols of a Sighting id, 10 of an Incident id (`ids.ts`). */
const SIGHTING_ID_BYTES = 18;
const INCIDENT_ID_BYTES = 20;

/** The newest local Sighting of any Incident: where this phone stood last. */
function ownPositionOf(state: VigiaState): OwnPosition | null {
  let newest: Bearing | null = null;
  for (const incident of state.incidents) {
    for (const entry of incident.entries) {
      const bearing = entry.sighting.bearing;
      if (entry.sighting.origin !== 'local') continue;
      if (newest === null || bearing.timeUtcMs > newest.timeUtcMs) newest = bearing;
    }
  }
  return newest === null
    ? null
    : { position: newest.observer, accuracyM: newest.positionAccuracyM };
}

/**
 * The first time after `nowUtcMs` at which the assessment of `incident` can change by time alone:
 * a sighting stops being in the future (`t − clockSkewToleranceMs`), or one sighting becomes too
 * old against now (`t + maxIncidentAgeMs`). `Infinity` when there is none.
 */
function nextLimitUtcMs(
  incident: Incident,
  nowUtcMs: number,
  skewMs: number,
  maxAgeMs: number,
): number {
  let next = Number.POSITIVE_INFINITY;
  for (const entry of incident.entries) {
    const t = entry.sighting.bearing.timeUtcMs;
    for (const limit of [t - skewMs, t + maxAgeMs + 1]) {
      if (limit > nowUtcMs && limit < next) next = limit;
    }
  }
  return next;
}

/** The earlier own position when it is the same place and accuracy, so that the screens see no change. */
function sameOwn(
  before: OwnPosition | null | undefined,
  after: OwnPosition | null,
): OwnPosition | null {
  if (before === undefined || before === null || after === null) return after;
  return before.position.latRad === after.position.latRad &&
    before.position.lonRad === after.position.lonRad &&
    before.accuracyM === after.accuracyM
    ? before
    : after;
}

function errorNameOf(error: unknown): string | undefined {
  const name: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
  return typeof name === 'string' && name !== '' ? name : undefined;
}

export function createVigiaStore(environment: VigiaEnvironment): VigiaStore {
  const { parameters, storage, clock, timer, page, transport, mode } = environment;
  const listeners = new Set<() => void>();
  let state: VigiaState = emptyState();
  let inbox: readonly InboxItem[] = [];
  let notices: readonly ScreenNotice[] = [];
  let nowUtcMs = clock();
  /** False when the stored value must not be overwritten (newer, unreadable, not backed up). */
  let writable = true;
  let addressHoldsCode = false;
  let receiveFailure: VigiaFailure | null = null;
  let linkArrivals = 0;
  let transportStatus: TransportStatus = { kind: 'available' };
  let sharesThisSession = 0;
  let open: OpenView | null = null;
  let openLimitUtcMs = Number.POSITIVE_INFINITY;
  let snapshot: VigiaSnapshot | null = null;
  /** The own position of the last state it was computed for: a new object only when it changes. */
  let own: { readonly state: VigiaState; readonly value: OwnPosition | null } | null = null;
  let tick: TimerHandle | null = null;
  const stops: Unsubscribe[] = [];

  const notify = (): void => {
    snapshot = null;
    for (const listener of [...listeners]) listener();
  };

  const addNotice = (notice: ScreenNotice): void => {
    if (notices.some((n) => n.reason === notice.reason)) return;
    notices = [...notices, notice];
  };

  /** The open Incident's view, computed again only when the Incident or a time limit changed. */
  const refreshOpen = (force: boolean): void => {
    const incident = state.incidents.find((i) => i.incidentId === state.openIncidentId) ?? null;
    if (incident === null) {
      open = null;
      openLimitUtcMs = Number.POSITIVE_INFINITY;
      return;
    }
    if (!force && open !== null && open.incident === incident && nowUtcMs < openLimitUtcMs) return;
    const assessment = assess(incident, nowUtcMs, parameters);
    const advice = assessment.ok ? nextSightingAdvice(assessment.value, parameters) : null;
    open = { incident, assessment, advice };
    openLimitUtcMs = nextLimitUtcMs(
      incident,
      nowUtcMs,
      parameters.clockSkewToleranceMs,
      parameters.maxIncidentAgeMs,
    );
  };

  const write = (): void => {
    if (!writable) return;
    const written = storage.write(serialiseState(state, nowUtcMs));
    if (!written.ok) addNotice({ reason: 'storage_unavailable' });
  };

  /** Applies an action; on a change of the state, writes it and tells the screens. */
  const apply = (action: VigiaAction): VigiaResult<void> => {
    const result = applyAction(state, action, parameters);
    if (!result.ok) return result;
    for (const notice of result.value.notices) {
      addNotice({
        reason: notice.reason,
        ...(notice.count === undefined ? {} : { count: notice.count }),
      });
    }
    const changed = result.value.state !== state;
    state = result.value.state;
    if (changed) write();
    refreshOpen(false);
    notify();
    return ok(undefined);
  };

  const load = (): void => {
    if (mode === 'device' && !storage.persistent) addNotice({ reason: 'storage_unavailable' });
    const read = storage.read();
    if (!read.ok) {
      writable = false;
      addNotice({ reason: 'storage_unavailable' });
      return;
    }
    const parsed = parseStoredState(read.value, nowUtcMs, parameters);
    if (!parsed.ok) {
      writable = false;
      addNotice({ reason: 'storage_unavailable' });
      return;
    }
    const value = parsed.value;
    if (value.kind === 'empty') return;
    if (value.kind === 'newer') {
      writable = false;
      addNotice({ reason: 'storage_version_unsupported' });
      return;
    }
    if (value.kind === 'corrupt') {
      addNotice({ reason: 'storage_corrupt' });
      const backup = storage.readBackup();
      const saved = backup.ok && backup.value === null && storage.writeBackup(value.raw).ok;
      if (!saved) {
        writable = false;
        addNotice({ reason: 'storage_unavailable' });
      }
      return;
    }
    if (value.dropped > 0) addNotice({ reason: 'storage_corrupt', count: value.dropped });
    const replaced = applyAction(state, { kind: 'replace', state: value.state }, parameters);
    if (replaced.ok) state = replaced.value.state;
  };

  /** Decodes a text that reached the phone into the Inbox (Req 9.4). */
  const receive = (text: string): VigiaResult<InboxItem> => {
    const extracted = extractSightingCode(text, parameters);
    if (!extracted.ok) return extracted;
    const decoded = decodeSighting(extracted.value, parameters);
    if (!decoded.ok) return decoded;
    const code = extracted.value;
    const held = inbox.find((i) => i.code === code);
    if (held !== undefined) return ok(held);
    const item: InboxItem = { code, sighting: decoded.value, arrivedUtcMs: nowUtcMs };
    inbox = [...inbox, item];
    return ok(item);
  };

  const handleFragment = (): void => {
    const fragment = page.fragment();
    if (fragment === '') return;
    const address = page.address();
    const extracted = extractSightingCode(address, parameters);
    if (!extracted.ok && extracted.reason === 'code_not_a_sighting') return;
    const cut = address.indexOf('#');
    addressHoldsCode = !page.replaceAddress(cut < 0 ? address : address.slice(0, cut));
    nowUtcMs = clock();
    const received = extracted.ok ? receive(extracted.value) : extracted;
    receiveFailure = received.ok ? null : received;
    linkArrivals += 1;
    notify();
  };

  const onTick = (): void => {
    nowUtcMs = clock();
    const result = applyAction(state, { kind: 'expire', nowUtcMs }, parameters);
    if (result.ok && result.value.state !== state) {
      state = result.value.state;
      write();
    }
    refreshOpen(false);
    notify();
  };

  const findEntry = (sightingId: string) => {
    for (const incident of state.incidents) {
      const entry = incident.entries.find((e) => e.sighting.sightingId === sightingId);
      if (entry !== undefined) return { incident, entry };
    }
    return null;
  };

  return {
    getSnapshot() {
      snapshot ??= {
        state,
        inbox,
        notices,
        nowUtcMs,
        open,
        ownPosition: (own =
          own?.state === state ? own : { state, value: sameOwn(own?.value, ownPositionOf(state)) })
          .value,
        addressHoldsCode,
        receiveFailure,
        linkArrivals,
        transportStatus,
        sharesThisSession,
      };
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      nowUtcMs = clock();
      load();
      const expired = applyAction(state, { kind: 'expire', nowUtcMs }, parameters);
      if (expired.ok && expired.value.state !== state) {
        state = expired.value.state;
        write();
      }
      refreshOpen(true);
      tick = timer.start(onTick, parameters.expiryCheckIntervalMs);
      stops.push(page.onFragmentChange(handleFragment));
      stops.push(
        transport.onReceive((text) => {
          nowUtcMs = clock();
          const received = receive(text);
          receiveFailure = received.ok ? null : received;
          notify();
        }),
      );
      stops.push(
        transport.onStatus((status) => {
          transportStatus = status;
          if (status.kind === 'unavailable') addNotice({ reason: status.reason });
          notify();
        }),
      );
      handleFragment();
      notify();
    },
    stop() {
      if (tick !== null) timer.stop(tick);
      tick = null;
      for (const stop of stops.splice(0)) stop();
    },
    dispatch(action) {
      nowUtcMs = clock();
      return apply(action);
    },
    capture(bearing, answer) {
      nowUtcMs = clock();
      const random = environment.random;
      if (!random.ok) return random;
      let incidentId = state.openIncidentId;
      if (answer === 'same' && incidentId === null) return err('incident_unknown');
      let bytes: Uint8Array;
      let incidentBytes: Uint8Array | null = null;
      try {
        bytes = random.value.bytes(SIGHTING_ID_BYTES);
        if (answer === 'new') incidentBytes = random.value.bytes(INCIDENT_ID_BYTES);
      } catch (error) {
        const errorName = errorNameOf(error);
        return err('random_unavailable', errorName === undefined ? {} : { errorName });
      }
      if (incidentBytes !== null) {
        const id = incidentIdFromBytes(incidentBytes, mode);
        if (!id.ok) return id;
        incidentId = id.value;
      }
      if (incidentId === null) return err('incident_unknown');
      const made = captureToSighting(bearing, bytes, incidentId, parameters);
      if (!made.ok) return made;
      // The new smoke is created only once the Sighting is known to be good, so that a refused
      // capture leaves nothing behind.
      if (answer === 'new') {
        const created = applyAction(
          state,
          { kind: 'createIncident', incidentId, nowUtcMs },
          parameters,
        );
        if (!created.ok) return created;
        const added = applyAction(
          created.value.state,
          { kind: 'addLocal', sighting: made.value.sighting, code: made.value.code, nowUtcMs },
          parameters,
        );
        if (!added.ok) return added;
        state = added.value.state;
        write();
        refreshOpen(false);
        notify();
        return ok(made.value.sighting);
      }
      const added = apply({
        kind: 'addLocal',
        sighting: made.value.sighting,
        code: made.value.code,
        nowUtcMs,
      });
      return added.ok ? ok(made.value.sighting) : added;
    },
    paste(text) {
      nowUtcMs = clock();
      const result = receive(text);
      notify();
      return result;
    },
    addFromInbox(code, joinIfUnknown) {
      const item = inbox.find((i) => i.code === code);
      if (item === undefined) return err('code_not_a_sighting');
      nowUtcMs = clock();
      const result = applyAction(
        state,
        { kind: 'addReceived', item, nowUtcMs, joinIfUnknown },
        parameters,
      );
      if (!result.ok) return result;
      inbox = inbox.filter((i) => i !== item);
      for (const notice of result.value.notices) addNotice({ reason: notice.reason });
      const changed = result.value.state !== state;
      state = result.value.state;
      if (changed) write();
      refreshOpen(false);
      notify();
      return ok(undefined);
    },
    ignore(code) {
      const kept = inbox.filter((i) => i.code !== code);
      if (kept.length === inbox.length) return;
      inbox = kept;
      notify();
    },
    markShared(sightingId, channel) {
      const found = findEntry(sightingId);
      if (found === null) return err('invalid_number', { field: 'sightingId' });
      if (
        incidentMode(found.incident.incidentId) === 'simulation' &&
        OUTWARD_CHANNELS.includes(channel)
      ) {
        return err('simulation_not_shareable');
      }
      nowUtcMs = clock();
      const marked = apply({
        kind: 'markShared',
        sightingId,
        record: { channel, atUtcMs: nowUtcMs },
      });
      if (marked.ok) {
        sharesThisSession += 1;
        notify();
      }
      return marked;
    },
    async sendToPeer(peer, sightingId) {
      const found = findEntry(sightingId);
      if (found === null) return err('invalid_number', { field: 'sightingId' });
      let sent: VigiaResult<void>;
      try {
        sent = await peer.send(found.entry.code);
      } catch (error) {
        const errorName = errorNameOf(error);
        sent = err('transport_unavailable', errorName === undefined ? {} : { errorName });
      }
      if (!sent.ok) return sent;
      nowUtcMs = clock();
      const marked = apply({
        kind: 'markShared',
        sightingId,
        record: { channel: 'memory', atUtcMs: nowUtcMs },
      });
      if (marked.ok) {
        sharesThisSession += 1;
        notify();
      }
      return marked;
    },
  };
}

const StoreContext = createContext<VigiaStore | null>(null);

export const StoreProvider = StoreContext.Provider;

/** The store of the screens; a programmer error outside a `StoreProvider`. */
export function useStore(): VigiaStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useStore outside a StoreProvider');
  return store;
}

/** The store's snapshot, kept current (`useSyncExternalStore`). */
export function useVigia(): VigiaSnapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
