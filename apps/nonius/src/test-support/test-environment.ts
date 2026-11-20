// A NoniusEnvironment made of fakes, for the tests of the store and the screens (test support, not
// exported). It records every call of `askLocation`, so that a test can say how many times the
// phone's location was asked.

import type { PositionFix } from '@alidade/sensors';
import type { MapLibreLike } from '@alidade/ui';
import { createMemoryStorage, type NoniusStorage } from '../adapters/storage';
import type { NoniusEnvironment } from '../components/environment';
import { defaultParameters } from '../math/parameters';
import type { NoniusResult } from '../result';
import { FakeMapLibre } from './fake-maplibre';
import { FakeTimer } from './fake-timer';

export interface TestEnvironment {
  readonly environment: NoniusEnvironment;
  readonly timer: FakeTimer;
  readonly storage: NoniusStorage;
  readonly maplibre: FakeMapLibre;
  /** The number of calls of `askLocation`. */
  readonly locationCalls: { count: number };
  /** What the next `askLocation` returns. */
  locationResult: NoniusResult<PositionFix>;
}

export const TEST_NOW_UTC_MS = Date.UTC(2026, 11, 21, 18, 0, 0);

export function testEnvironment(over: Partial<NoniusEnvironment> = {}): TestEnvironment {
  const timer = new FakeTimer();
  const storage = over.storage ?? createMemoryStorage();
  const maplibre = new FakeMapLibre();
  const locationCalls = { count: 0 };
  const handle: TestEnvironment = {
    timer,
    storage,
    maplibre,
    locationCalls,
    locationResult: {
      ok: true,
      value: {
        position: { latRad: 0.5235987755982988, lonRad: -0.6981317007977318 },
        reportedAccuracyM: 20,
        sigmaM: 10,
        timeUtcMs: TEST_NOW_UTC_MS,
      },
    },
    environment: undefined as unknown as NoniusEnvironment,
  };
  const environment: NoniusEnvironment = {
    mode: 'device',
    parameters: defaultParameters(),
    clock: () => TEST_NOW_UTC_MS,
    timer,
    storage,
    askLocation: () => {
      locationCalls.count += 1;
      return Promise.resolve(handle.locationResult);
    },
    simulatedTruth: null,
    loadMap: () => Promise.resolve({ ok: true, value: maplibre as unknown as MapLibreLike }),
    tiles: null,
    tilesFailure: null,
    sighting: {
      kind: 'simulation',
      render: () => null,
    },
    ...over,
  };
  return Object.assign(handle, { environment });
}
