// The Playground's entry (Req 18, design §10): builds the browser dependencies and renders the
// page. The tile source comes from the environment (Req 18.5); with none, the map is drawn on a
// plain background and makes no request.

import 'maplibre-gl/dist/maplibre-gl.css';
import './playground.css';
import {
  browserEnvironment,
  createBrowserSensorSource,
  LISTENING_TIMEOUT_MS,
  POSITION_CONFIDENCE_SCALE,
  POSITION_TIMEOUT_MS,
  systemClock,
} from '@alidade/sensors';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  browserCameraSurface,
  buildCatalogue,
  checkTileSource,
  loadMapLibre,
  type TileSource,
} from '../src/index';
import { Playground, type PlaygroundDeps } from './Playground';
import { systemTimer } from './system-timer';

function tilesFromEnv(): TileSource | null {
  const templates = (import.meta.env.VITE_TILE_URL_TEMPLATE ?? '')
    .split(/\s+/)
    .filter((t) => t !== '');
  const attribution = (import.meta.env.VITE_TILE_ATTRIBUTION ?? '').trim();
  if (templates.length === 0) return null;
  const checked = checkTileSource({
    tileUrlTemplates: templates,
    attribution,
    minZoom: 0,
    maxZoom: 19,
    tileSizePx: 256,
  });
  return checked.ok ? checked.value : null;
}

const sensorOptions = {
  listeningTimeoutMs: LISTENING_TIMEOUT_MS,
  positionTimeoutMs: POSITION_TIMEOUT_MS,
  positionConfidenceScale: POSITION_CONFIDENCE_SCALE,
};
const environment = browserEnvironment();
const deps: PlaygroundDeps = {
  timer: systemTimer,
  hasDeviceOrientation: environment.hasDeviceOrientation,
  tiles: tilesFromEnv(),
  loadMapLibre,
  cameraSurface: browserCameraSurface(),
  createDeviceSource: () => createBrowserSensorSource(environment, systemClock, sensorOptions),
  catalogue: buildCatalogue(),
  sensorOptions,
};

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Playground deps={deps} />
    </StrictMode>,
  );
}
