// The providers of the app's environment and store around a screen under test (test support, not
// exported), for `renderScreen`'s `wrap`.

import type { ReactElement, ReactNode } from 'react';
import { EnvironmentProvider } from '../components/environment';
import { createNoniusStore, StoreProvider, type NoniusStore } from '../components/store';
import type { TestEnvironment } from './test-environment';

export interface Wrapped {
  readonly store: NoniusStore;
  readonly wrap: (children: ReactNode) => ReactElement;
}

export function appWrap(t: TestEnvironment, store = createNoniusStore(t.environment)): Wrapped {
  return {
    store,
    wrap: (children) => (
      <EnvironmentProvider value={t.environment}>
        <StoreProvider value={store}>{children}</StoreProvider>
      </EnvironmentProvider>
    ),
  };
}
