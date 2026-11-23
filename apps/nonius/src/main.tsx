// The composition root (design §9; Req 1.3, 9.6): the only file that reads the build environment
// and the browser's globals and hands them to the screens as one environment object.

import 'maplibre-gl/dist/maplibre-gl.css';
import {
  browserEnvironment,
  createBrowserSensorSource,
  LISTENING_TIMEOUT_MS,
  POSITION_CONFIDENCE_SCALE,
  POSITION_TIMEOUT_MS,
  POSITION_STALENESS_MS,
} from '@alidade/sensors';
import {
  applyTheme,
  browserCameraSurface,
  checkTileSource,
  defaultSessionParameters,
  instrument,
  loadMapLibre,
  type TileSource,
} from '@alidade/ui';
import { createRoot } from 'react-dom/client';
import { createStorageFromHost, DEVICE_KEY, SIMULATION_KEY } from './adapters/storage';
import { askLocationOnce } from './components/ask-location';
import type { NoniusEnvironment, TileSourceNote } from './components/environment';
import { initialMode, Root } from './components/Root';
import { defaultClock, defaultTimer } from './defaults';
import { defaultParameters } from './math/parameters';
import { sunScenes } from './math/scenes/sun-scenes';
import { tileSetupFromEnvironment } from './math/tile-setup';
import type { NoniusFailure } from './result';

const TILE_MIN_ZOOM = 0;
const TILE_MAX_ZOOM = 19;
const TILE_SIZE_PX = 256;

const parameters = defaultParameters();
const sensorOptions = {
  listeningTimeoutMs: LISTENING_TIMEOUT_MS,
  positionTimeoutMs: POSITION_TIMEOUT_MS,
  positionConfidenceScale: POSITION_CONFIDENCE_SCALE,
};
/** Every capture is raw: the Index error is applied when the Fix is computed (Req 4.4). */
const sessionParameters = {
  ...defaultSessionParameters(),
  altitudeCalibration: { offsetRad: 0, sigmaRad: 0 },
};

interface Tiles {
  readonly tiles: TileSource | null;
  readonly tilesFailure: NoniusFailure | null;
  readonly note: TileSourceNote | undefined;
}

/** The tile source of the build environment (Req 9.6); none gives the plain background. */
function tilesFromBuildEnvironment(): Tiles {
  const setup = tileSetupFromEnvironment({
    urlTemplate: import.meta.env.VITE_TILE_URL_TEMPLATE,
    attribution: import.meta.env.VITE_TILE_ATTRIBUTION,
    sourceName: import.meta.env.VITE_TILE_SOURCE_NAME,
    termsUrl: import.meta.env.VITE_TILE_TERMS_URL,
  });
  if (!setup.ok) return { tiles: null, tilesFailure: setup, note: undefined };
  if (setup.value === null) return { tiles: null, tilesFailure: null, note: undefined };
  const { tileUrlTemplates, attribution, sourceName, termsUrl } = setup.value;
  const tiles = checkTileSource({
    tileUrlTemplates,
    attribution,
    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    tileSizePx: TILE_SIZE_PX,
  });
  if (!tiles.ok) return { tiles: null, tilesFailure: tiles, note: undefined };
  return { tiles: tiles.value, tilesFailure: null, note: { sourceName, attribution, termsUrl } };
}

function build(): void {
  const root = document.getElementById('root');
  if (root === null) return;
  const browser = browserEnvironment();
  const tiles = tilesFromBuildEnvironment();
  const createSource = () => createBrowserSensorSource(browser, defaultClock, sensorOptions);
  const environment: NoniusEnvironment = {
    mode: 'device',
    parameters,
    clock: defaultClock,
    timer: defaultTimer,
    storage: createStorageFromHost(globalThis, DEVICE_KEY),
    askLocation: () =>
      askLocationOnce(createSource, {
        clock: defaultClock,
        positionStalenessMs: POSITION_STALENESS_MS,
        coarseLocationLimitM: parameters.locationCoarseLimitM,
      }),
    simulatedTruth: null,
    loadMap: loadMapLibre,
    tiles: tiles.tiles,
    tilesFailure: tiles.tilesFailure,
    ...(tiles.note === undefined ? {} : { tileSourceNote: tiles.note }),
    sighting: {
      kind: 'device',
      createSource,
      cameraSurface: browserCameraSurface(),
      sessionParameters,
    },
  };
  const scenes = sunScenes(parameters);
  if (!scenes.ok) throw new Error('the scenes could not be built');
  // Nonius's look is Instrument (skeleton-ui Req 22.14): written on the root before the first render.
  applyTheme(document.documentElement, instrument);
  createRoot(root).render(
    <Root
      startMode={initialMode({ hasDeviceOrientation: browser.hasDeviceOrientation })}
      hasDeviceOrientation={browser.hasDeviceOrientation}
      deviceEnvironment={environment}
      simulation={{
        scenes: scenes.value,
        base: {
          parameters,
          timer: defaultTimer,
          storage: createStorageFromHost(globalThis, SIMULATION_KEY),
          loadMap: loadMapLibre,
          tiles: tiles.tiles,
          tilesFailure: tiles.tilesFailure,
          ...(tiles.note === undefined ? {} : { tileSourceNote: tiles.note }),
        },
        sessionParameters,
        sensorOptions,
      }}
    />,
  );
}

build();
