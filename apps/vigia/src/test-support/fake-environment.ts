// A `VigiaEnvironment` of fakes for the component tests (test support, not exported; Req 21.2):
// the real Adapters over fake browser objects (storage, navigator, crypto, page), a fake Timer and
// a Clock that follows it, a recording Network gate, the real manual Transport with every send
// recorded, the real QR encoder, and a map loader that gives UI's map fake. Each fake is returned
// beside the environment so that a test can read what was asked of it.

import type { MapLibreLike, Session, UiResult } from '@alidade/ui';
import type { ReactNode } from 'react';
import { createClipboard } from '../adapters/clipboard';
import { createPage } from '../adapters/page-address';
import { createQrEncoder, type VigiaQr } from '../adapters/qr-encoder';
import { createRandom } from '../adapters/random';
import { createMemoryStorage, createStorage, type VigiaStorage } from '../adapters/storage';
import {
  createManualTransport,
  type ManualTransport,
} from '../adapters/transport/manual-transport';
import type {
  SightingSource,
  SimulationPeer,
  VigiaEnvironment,
  VigiaMode,
} from '../components/environment';
import { defaultParameters, type VigiaParameters } from '../math/parameters';
import { ok } from '../result';
import {
  createFakeCrypto,
  createFakeNavigator,
  createFakePage,
  createFakeStorage,
  type FakeNavigatorOptions,
  type FakePage,
  type FakeStorage,
} from './fake-browser';
import { FakeTimer } from './fake-timer';
import { createRecordingGate, type RecordingGate } from './recording-gate';

/** The fake time at which every environment starts: 2026-09-21 14:13:20 UTC. */
export const START_UTC_MS = 1_790_000_000_000;

export interface FakeEnvironmentOptions {
  readonly mode?: VigiaMode;
  readonly href?: string;
  readonly storedItems?: Readonly<Record<string, string>>;
  /** A memory storage (`persistent: false`) instead of the fake browser storage. */
  readonly memoryStorage?: boolean;
  readonly navigator?: FakeNavigatorOptions;
  readonly randomAvailable?: boolean;
  readonly peers?: readonly SimulationPeer[];
  readonly parameters?: VigiaParameters;
  readonly sighting?: SightingSource;
  readonly map?: MapLibreLike;
}

export interface FakeEnvironment {
  readonly environment: VigiaEnvironment;
  readonly timer: FakeTimer;
  readonly storage: FakeStorage;
  readonly navigator: ReturnType<typeof createFakeNavigator>;
  readonly page: FakePage;
  readonly gate: RecordingGate;
  readonly transport: ManualTransport;
  /** Every code the Transport was asked to send. */
  readonly sent: string[];
  /** Every Session the simulation's sighting source has been asked to render with. */
  readonly sessionListeners: ((session: Session) => void)[];
}

/** A sighting source that renders a marker and hands the test the Session listener. */
export function recordingSightingSource(
  listeners: ((session: Session) => void)[],
  marker: ReactNode = null,
): SightingSource {
  return {
    kind: 'simulation',
    render: (onSession) => {
      if (!listeners.includes(onSession)) listeners.push(onSession);
      return marker;
    },
  };
}

export function createFakeEnvironment(options: FakeEnvironmentOptions = {}): FakeEnvironment {
  const parameters = options.parameters ?? defaultParameters();
  const timer = new FakeTimer();
  const storage = createFakeStorage(options.storedItems ?? {});
  const navigator = createFakeNavigator(options.navigator ?? {});
  const page = createFakePage(options.href ?? 'https://app.example.test/');
  const gate = createRecordingGate();
  const sent: string[] = [];
  const transport = createManualTransport({ present: (code) => void sent.push(code) });
  const qr = createQrEncoder(parameters);
  if (!qr.ok) throw new Error(`createQrEncoder failed: ${qr.reason}`);
  const sessionListeners: ((session: Session) => void)[] = [];
  const vigiaStorage: VigiaStorage = options.memoryStorage
    ? createMemoryStorage()
    : createStorage(storage);
  const loadMap = (): Promise<UiResult<MapLibreLike>> =>
    options.map === undefined
      ? new Promise<UiResult<MapLibreLike>>(() => undefined)
      : Promise.resolve(ok(options.map));
  const environment: VigiaEnvironment = {
    mode: options.mode ?? 'device',
    parameters,
    clock: () => START_UTC_MS + timer.nowMs(),
    timer,
    random:
      options.randomAvailable === false
        ? createRandom(undefined)
        : createRandom(createFakeCrypto()),
    storage: vigiaStorage,
    clipboard: createClipboard(navigator),
    page: createPage(page.location, page.history, page.events),
    gate,
    transport,
    peers: options.peers ?? [],
    qr: qr.value satisfies VigiaQr,
    loadMap,
    tiles: null,
    tilesFailure: null,
    sighting: options.sighting ?? recordingSightingSource(sessionListeners),
  };
  return { environment, timer, storage, navigator, page, gate, transport, sent, sessionListeners };
}
