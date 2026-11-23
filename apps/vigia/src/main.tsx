// The composition root (design D1, §10, §13; Req 1.8, 11.4, 17.1, 18.2): the one file that builds
// the real Adapters from the browser's objects, reads the build environment, chooses the mode the
// page starts in and renders it. Everything else receives plain data and Adapters through the
// environment (`components/environment.ts`).
//
// The tile provider comes from the build environment (four variables, `.env.example`): with all
// four present and valid the Host list holds its entry and the map has tiles from it; with any
// missing, the plain background and no failure shown; an invalid template shows `host_not_allowed`
// on the Map screen. No host is written in the source.

import 'maplibre-gl/dist/maplibre-gl.css';
import {
  browserEnvironment,
  createBrowserSensorSource,
  LISTENING_TIMEOUT_MS,
  POSITION_CONFIDENCE_SCALE,
  POSITION_TIMEOUT_MS,
} from '@alidade/sensors';
import {
  browserCameraSurface,
  checkTileSource,
  defaultSessionParameters,
  loadMapLibre,
  type TileSource,
} from '@alidade/ui';
import { createRoot } from 'react-dom/client';
import { createClipboard } from './adapters/clipboard';
import { createNetworkGate, type FetchLike } from './adapters/network-gate';
import { createPage } from './adapters/page-address';
import { createQrEncoder } from './adapters/qr-encoder';
import { createRandom } from './adapters/random';
import { createStorageFromHost } from './adapters/storage';
import { createManualTransport } from './adapters/transport/manual-transport';
import type { SightingSource, TileSourceNote, VigiaEnvironment } from './components/environment';
import { Root } from './components/Root';
import { chooseTheme } from './components/theme-choice';
import { smokeScenes } from './math/scenes/smoke-scenes';
import { defaultParameters } from './math/parameters';
import { HOST_LIST, type HostList } from './math/network/host-list';
import { tileSetupFromEnvironment } from './math/network/tile-setup';
import { initialMode } from './math/start-mode';
import type { VigiaFailure } from './result';
import { systemClock, systemTimer } from './system';

const TILE_MIN_ZOOM = 0;
const TILE_MAX_ZOOM = 19;
const TILE_SIZE_PX = 256;

const parameters = defaultParameters();
const sensorOptions = {
  listeningTimeoutMs: LISTENING_TIMEOUT_MS,
  positionTimeoutMs: POSITION_TIMEOUT_MS,
  positionConfidenceScale: POSITION_CONFIDENCE_SCALE,
};
const sessionParameters = defaultSessionParameters();

interface Tiles {
  readonly hostList: HostList;
  readonly tiles: TileSource | null;
  readonly tilesFailure: VigiaFailure | null;
  readonly note: TileSourceNote | undefined;
}

/** The tile source of the build environment, checked against the Host list (Req 11.4). */
function tilesFromBuildEnvironment(): Tiles {
  const setup = tileSetupFromEnvironment({
    urlTemplate: import.meta.env.VITE_TILE_URL_TEMPLATE,
    attribution: import.meta.env.VITE_TILE_ATTRIBUTION,
    sourceName: import.meta.env.VITE_TILE_SOURCE_NAME,
    termsUrl: import.meta.env.VITE_TILE_TERMS_URL,
  });
  if (!setup.ok) {
    return { hostList: HOST_LIST, tiles: null, tilesFailure: setup, note: undefined };
  }
  if (setup.value === null) {
    return { hostList: HOST_LIST, tiles: null, tilesFailure: null, note: undefined };
  }
  const { hostList, tileUrlTemplates, attribution, sourceName, termsUrl } = setup.value;
  const tiles = checkTileSource({
    tileUrlTemplates,
    attribution,
    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    tileSizePx: TILE_SIZE_PX,
  });
  if (!tiles.ok) return { hostList: HOST_LIST, tiles: null, tilesFailure: tiles, note: undefined };
  return {
    hostList,
    tiles: tiles.value,
    tilesFailure: null,
    note: { sourceName, attribution, termsUrl },
  };
}

function build(): void {
  const root = document.getElementById('root');
  if (root === null) return;

  const browser = browserEnvironment();
  const tiles = tilesFromBuildEnvironment();
  const qr = createQrEncoder(parameters);
  const gate = createNetworkGate(
    globalThis.fetch.bind(globalThis) as FetchLike,
    tiles.hostList,
    parameters,
    systemTimer,
  );
  // The parameters and the QR encoder are constants of this build: a failure here is a bug.
  if (!qr.ok || !gate.ok) throw new Error('the page could not be built');

  const sighting: SightingSource = {
    kind: 'device',
    createSource: () => createBrowserSensorSource(browser, systemClock, sensorOptions),
    cameraSurface: browserCameraSurface(),
    sessionParameters,
  };
  const shared = {
    parameters,
    timer: systemTimer,
    random: createRandom(globalThis.crypto),
    clipboard: createClipboard(navigator),
    gate: gate.value,
    qr: qr.value,
    loadMap: loadMapLibre,
    tiles: tiles.tiles,
    tilesFailure: tiles.tilesFailure,
    ...(tiles.note === undefined ? {} : { tileSourceNote: tiles.note }),
  };
  const page = createPage(location, history, window);
  const deviceEnvironment: VigiaEnvironment = {
    ...shared,
    mode: 'device',
    clock: systemClock,
    storage: createStorageFromHost(globalThis),
    page,
    transport: createManualTransport({ present: () => undefined }),
    peers: [],
    sighting,
  };
  const scenes = smokeScenes();
  if (!scenes.ok) throw new Error('the scenes could not be built');

  // Field, whatever the phone's colour scheme (Req 22.3 as amended 2026-11-23, D25.8).
  chooseTheme(document.documentElement);
  createRoot(root).render(
    <Root
      startMode={initialMode({
        hasDeviceOrientation: browser.hasDeviceOrientation,
        address: page.address(),
      })}
      hasDeviceOrientation={browser.hasDeviceOrientation}
      deviceEnvironment={deviceEnvironment}
      simulation={{
        catalogue: scenes.value,
        base: shared,
        sessionParameters,
        sensorOptions,
      }}
    />,
  );
}

build();
