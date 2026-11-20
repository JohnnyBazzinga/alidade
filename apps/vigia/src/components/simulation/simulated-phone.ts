// The simulated phones of Simulation mode (design D16, §10; Req 17.1, 17.4, 17.5). One phone for
// each Station of the chosen scene: its own store over a memory storage (nothing is written to the
// real one), its own endpoint on one in-memory network, and the page's own address and fragment
// replaced by a page that is always empty, so that a link opened in the real page reaches no phone.
// A code goes from one phone to another as text only. The Clock is the largest time any Session
// has reported, so that ages and expiry are in simulated time and never run backwards.

import type { CatalogueScene } from '@alidade/ui';
import { createPage, type VigiaPage } from '../../adapters/page-address';
import { createMemoryStorage } from '../../adapters/storage';
import { createMemoryNetwork } from '../../adapters/transport/memory-network';
import type { DeliveryPlan } from '../../math/transport/transport';
import type { SimulationPeer, SightingSource, VigiaEnvironment, Clock } from '../environment';
import { createVigiaStore, type VigiaStore } from '../store';

/** The Clock of the simulation: the largest time reported, never decreasing. */
export interface SimulationClock {
  now: Clock;
  /** Reports a time a Session has reached; a time that is not finite or is earlier is ignored. */
  report(timeUtcMs: number): void;
}

export function createSimulationClock(startUtcMs: number): SimulationClock {
  let currentUtcMs = startUtcMs;
  return {
    now: () => currentUtcMs,
    report(timeUtcMs) {
      if (Number.isFinite(timeUtcMs) && timeUtcMs > currentUtcMs) currentUtcMs = timeUtcMs;
    },
  };
}

/** What the phones share: the Adapters of the page, handed down from the composition root. */
export type SimulationBase = Pick<
  VigiaEnvironment,
  | 'parameters'
  | 'timer'
  | 'random'
  | 'clipboard'
  | 'gate'
  | 'qr'
  | 'loadMap'
  | 'tiles'
  | 'tilesFailure'
  | 'tileSourceNote'
>;

export interface SimulatedPhone {
  /** The id of the Station of the scene this phone stands at. */
  readonly stationId: string;
  /** "the phone at the east post". */
  readonly label: string;
  readonly environment: VigiaEnvironment;
  readonly store: VigiaStore;
  /** Stops the store and leaves the network. */
  stop(): void;
}

export interface SimulatedPhonesInput {
  readonly entry: CatalogueScene;
  readonly clock: Clock;
  /** The source of the Sight screen, the same for every phone (the Simulator panel). */
  readonly sighting: SightingSource;
  readonly base: SimulationBase;
}

/** A page with no address and no fragment: nothing the real page holds reaches a phone. */
function emptyPage(): VigiaPage {
  return createPage(
    { href: '', hash: '' },
    {
      replaceState() {
        // Nothing to replace.
      },
    },
    {
      addEventListener() {
        // The fragment never changes.
      },
      removeEventListener() {
        // The fragment never changes.
      },
    },
  );
}

/**
 * The phones of a scene, not yet started: the caller starts each store and stops each phone.
 * Sending to a peer delivers to that phone alone: the plan of the network delivers one copy at
 * once to the phone being sent to, and to no other.
 */
export function createSimulatedPhones(input: SimulatedPhonesInput): readonly SimulatedPhone[] {
  const { entry, clock, sighting, base } = input;
  let target: string | null = null;
  const plan: DeliveryPlan = (_from, to) =>
    target === null || to === target ? [{ copies: 1, delayMs: 0 }] : [];
  const network = createMemoryNetwork(plan, base.timer);
  const stations = entry.scene.stations;
  const labelOf = (name: string) => `the phone at the ${name.toLowerCase()}`;

  return stations.map((station) => {
    const endpoint = network.join(station.id);
    const peers: SimulationPeer[] = stations
      .filter((other) => other.id !== station.id)
      .map((other) => ({
        id: other.id,
        label: labelOf(other.name),
        send: (code) => {
          target = other.id;
          try {
            return endpoint.send(code);
          } finally {
            target = null;
          }
        },
      }));
    const environment: VigiaEnvironment = {
      ...base,
      mode: 'simulation',
      clock,
      storage: createMemoryStorage(),
      page: emptyPage(),
      transport: endpoint,
      peers,
      sighting,
    };
    const store = createVigiaStore(environment);
    return {
      stationId: station.id,
      label: labelOf(station.name),
      environment,
      store,
      stop() {
        store.stop();
        endpoint.stop();
      },
    };
  });
}
