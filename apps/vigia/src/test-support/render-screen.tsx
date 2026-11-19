// Renders a screen inside its environment and store, for the component tests (test support, not
// exported). `settle` lets pending promises (a copy, a share) finish inside `act`.

import { act, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { EnvironmentProvider } from '../components/environment';
import { createVigiaStore, StoreProvider, type VigiaStore } from '../components/store';
import type { Incident, VigiaState } from '../math/incident/incident-state';
import { serialiseState } from '../math/incident/storage-format';
import { STATE_KEY } from '../adapters/storage';
import {
  createFakeEnvironment,
  START_UTC_MS,
  type FakeEnvironment,
  type FakeEnvironmentOptions,
} from './fake-environment';

export interface RenderedScreen extends ReturnType<typeof render> {
  readonly fake: FakeEnvironment;
  readonly store: VigiaStore;
  settle(fn?: () => void): Promise<void>;
}

export function renderScreen(
  ui: ReactElement,
  options: FakeEnvironmentOptions = {},
  fake: FakeEnvironment = createFakeEnvironment(options),
): RenderedScreen {
  const store = createVigiaStore(fake.environment);
  store.start();
  const utils = render(
    <EnvironmentProvider value={fake.environment}>
      <StoreProvider value={store}>{ui}</StoreProvider>
    </EnvironmentProvider>,
  );
  const settle = async (fn: () => void = () => undefined): Promise<void> => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  return { ...utils, fake, store, settle };
}

/** The storage items of a phone that holds these Incidents, the first one open. */
export function storedWith(incidents: readonly Incident[]): Record<string, string> {
  const state: VigiaState = { incidents, openIncidentId: incidents[0]?.incidentId ?? null };
  return { [STATE_KEY]: serialiseState(state, START_UTC_MS) };
}

/** The Incident with every entry made a received one (this phone took none of them). */
export function allReceived(incident: Incident): Incident {
  return {
    ...incident,
    entries: incident.entries.map((e) => ({
      ...e,
      sighting: { ...e.sighting, origin: 'received', receivedUtcMs: START_UTC_MS - 1000 },
    })),
  };
}
