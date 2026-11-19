// What the screens receive from the composition root (design D3, §6): the Adapters as types, the
// parameters, the mode and the source of the sighting screen, in one object handed down by a React
// context, so that a component test passes fakes. Nothing here reads a browser global.

import type { SensorResult, SensorSource } from '@alidade/sensors';
import type {
  CameraSurface,
  MapLibreLike,
  ObserveElementSize,
  Session,
  SessionParameters,
  TileSource,
  Timer,
  UiResult,
} from '@alidade/ui';
import { createContext, useContext, type ReactNode } from 'react';
import type { NetworkGate } from '../adapters/network-gate';
import type { VigiaClipboard } from '../adapters/clipboard';
import type { VigiaPage } from '../adapters/page-address';
import type { VigiaQr } from '../adapters/qr-encoder';
import type { VigiaRandom } from '../adapters/random';
import type { VigiaStorage } from '../adapters/storage';
import type { VigiaParameters } from '../math/parameters';
import type { Transport } from '../math/transport/transport';
import type { VigiaFailure, VigiaResult } from '../result';

/** Milliseconds since the epoch, UTC (Sensors' `systemClock` has this type). */
export type Clock = () => number;

export type VigiaMode = 'device' | 'simulation';

/** Another simulated phone on the table (Req 17.4, 17.5): a code goes to it as text only. */
export interface SimulationPeer {
  readonly id: string;
  /** "the phone at the east post". */
  readonly label: string;
  send(code: string): Promise<VigiaResult<void>>;
}

/**
 * Where the sighting screen's Session comes from (Req 3.1, 3.3). On a phone: the phone's Sensor
 * source and rear camera through UI's `DeviceSighting`, crosshair only. In Simulation mode: the
 * shell's Simulator panel and Scene image, rendered by the shell.
 */
export type SightingSource =
  | {
      readonly kind: 'device';
      /** Stable between renders. */
      readonly createSource: () => SensorResult<SensorSource>;
      readonly cameraSurface: CameraSurface;
      /** Stable between renders. */
      readonly sessionParameters: SessionParameters;
      readonly observe?: ObserveElementSize;
    }
  | {
      readonly kind: 'simulation';
      readonly render: (onSession: (session: Session) => void) => ReactNode;
    };

export interface VigiaEnvironment {
  readonly mode: VigiaMode;
  readonly parameters: VigiaParameters;
  readonly clock: Clock;
  readonly timer: Timer;
  /** `random_unavailable` when the browser has no secure random source (shown at a capture). */
  readonly random: VigiaResult<VigiaRandom>;
  readonly storage: VigiaStorage;
  readonly clipboard: VigiaClipboard;
  readonly page: VigiaPage;
  readonly gate: NetworkGate;
  /** The receive side: what any channel delivers reaches the store through it. */
  readonly transport: Transport;
  /** The other simulated phones; empty on a phone. */
  readonly peers: readonly SimulationPeer[];
  readonly qr: VigiaQr;
  readonly loadMap: () => Promise<UiResult<MapLibreLike>>;
  /** The Tile source, checked against the Host list at start; `null` for the plain background. */
  readonly tiles: TileSource | null;
  /** Why there is no Tile source although one was configured (`host_not_allowed`). */
  readonly tilesFailure: VigiaFailure | null;
  readonly sighting: SightingSource;
}

const EnvironmentContext = createContext<VigiaEnvironment | null>(null);

export const EnvironmentProvider = EnvironmentContext.Provider;

/** The environment of the screens; a programmer error outside an `EnvironmentProvider`. */
export function useEnvironment(): VigiaEnvironment {
  const environment = useContext(EnvironmentContext);
  if (environment === null) throw new Error('useEnvironment outside an EnvironmentProvider');
  return environment;
}
