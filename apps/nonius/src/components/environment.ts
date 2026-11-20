// What the screens receive from the composition root (design D17, D18, §9): the Adapters as types,
// the parameters, the mode and the source of the sighting screen, in one object handed down by a
// React context, so that a component test passes fakes. Nothing here reads a browser global.

import type { PositionFix, SensorResult, SensorSource } from '@alidade/sensors';
import type { Position } from '@alidade/core';
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
import type { NoniusStorage } from '../adapters/storage';
import type { NoniusParameters } from '../math/parameters';
import type { NoniusFailure, NoniusResult } from '../result';

/** Milliseconds since the epoch, UTC (Sensors' `systemClock` has this type). */
export type Clock = () => number;

export type NoniusMode = 'device' | 'simulation';

/**
 * Where the sighting screen's Session comes from (Req 4.1, 4.3). On a phone: the phone's Sensor
 * source and rear camera through UI's `DeviceSighting` with `kind: 'altitude'`, crosshair only. In
 * Simulation mode: the shell's Simulator panel and Scene image, rendered by the shell.
 */
export type SightingSource =
  | {
      readonly kind: 'device';
      /** Stable between renders. */
      readonly createSource: () => SensorResult<SensorSource>;
      readonly cameraSurface: CameraSurface;
      /** Stable between renders; its altitude calibration is `{ 0, 0 }` (Req 4.4). */
      readonly sessionParameters: SessionParameters;
      readonly observe?: ObserveElementSize;
    }
  | {
      readonly kind: 'simulation';
      readonly render: (onSession: (session: Session) => void) => ReactNode;
    };

/** What the Map screen says about the tile provider the build named (Req 9.6). */
export interface TileSourceNote {
  readonly sourceName: string;
  readonly attribution: string;
  readonly termsUrl: string;
}

export interface NoniusEnvironment {
  readonly mode: NoniusMode;
  readonly parameters: NoniusParameters;
  readonly clock: Clock;
  readonly timer: Timer;
  readonly storage: NoniusStorage;
  /**
   * The phone's location, asked once on the user's act (Req 11.2, 15.2). On a phone this is
   * `askLocationOnce`; in Simulation mode it answers with the scene's true position and asks no
   * Sensor source (Req 11.5, 15.7).
   */
  readonly askLocation: () => Promise<NoniusResult<PositionFix>>;
  /** The scene's true position in Simulation mode, for the labels; `null` on a phone. */
  readonly simulatedTruth: Position | null;
  readonly loadMap: () => Promise<UiResult<MapLibreLike>>;
  /** The Tile source, checked at start; `null` for the plain background. */
  readonly tiles: TileSource | null;
  /** Why there is no Tile source although one was configured. */
  readonly tilesFailure: NoniusFailure | null;
  readonly tileSourceNote?: TileSourceNote | undefined;
  readonly sighting: SightingSource;
}

const EnvironmentContext = createContext<NoniusEnvironment | null>(null);

export const EnvironmentProvider = EnvironmentContext.Provider;

/** The environment of the screens; a programmer error outside an `EnvironmentProvider`. */
export function useEnvironment(): NoniusEnvironment {
  const environment = useContext(EnvironmentContext);
  if (environment === null) throw new Error('useEnvironment outside an EnvironmentProvider');
  return environment;
}
