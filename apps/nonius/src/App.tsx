// The App (design §9): three tabs (Fix, Sights, Map), three full screens (Sight, Index error, How
// it works), one column of the screen's height: banner and phone bar in Simulation mode, the
// scrolling screen, the primary-action row, and the tab bar. Nothing is a layer over anything.

import { BODY_FONT_STACK, COLOURS, SIZES } from '@alidade/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EnvironmentProvider, type NoniusEnvironment } from './components/environment';
import { FixScreen } from './components/FixScreen';
import { HowItWorks } from './components/HowItWorks';
import { IndexErrorScreen } from './components/IndexErrorScreen';
import { MapScreen } from './components/MapScreen';
import { PrimaryRowProvider } from './components/PrimaryAction';
import { SightScreen } from './components/SightScreen';
import { SightsScreen } from './components/SightsScreen';
import { SimulationBanner } from './components/SimulationBanner';
import { StoreProvider, useNonius, type NoniusStore } from './components/store';
import { TabBar, type TabId } from './components/TabBar';

export interface AppProps {
  readonly environment: NoniusEnvironment;
  readonly store: NoniusStore;
  /** In Simulation mode: the bar under the banner that says what the reviewer holds (design §10). */
  readonly phoneBar?: ReactNode;
  /** In Simulation mode: the three short lines of the reviewer's path, on the first screen. */
  readonly reviewerPath?: ReactNode;
  /** Where the sights come from, shown on the first screen when the browser offers both. */
  readonly modeControl?: ReactNode;
}

type Route =
  | { readonly kind: 'tab'; readonly tab: TabId }
  | { readonly kind: 'sight'; readonly back: TabId }
  | { readonly kind: 'index_error'; readonly back: TabId }
  | { readonly kind: 'how'; readonly back: TabId };

function Shell({ phoneBar, reviewerPath, modeControl, environment }: Omit<AppProps, 'store'>) {
  const { state } = useNonius();
  const [route, setRoute] = useState<Route>({ kind: 'tab', tab: 'fix' });
  const main = useRef<HTMLElement | null>(null);
  const [primaryRow, setPrimaryRow] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (main.current !== null) main.current.scrollTop = 0;
  }, [route]);

  const currentTab: TabId = route.kind === 'tab' ? route.tab : route.back;
  const toTab = (tab: TabId) => setRoute({ kind: 'tab', tab });

  let content;
  if (route.kind === 'sight') {
    content = <SightScreen onDone={() => toTab(route.back)} />;
  } else if (route.kind === 'index_error') {
    content = (
      <IndexErrorScreen onDone={() => toTab(route.back)} onCancel={() => toTab(route.back)} />
    );
  } else if (route.kind === 'how') {
    content = <HowItWorks onBack={() => toTab(route.back)} />;
  } else if (route.tab === 'sights') {
    content = (
      <SightsScreen onMeasureIndexError={() => setRoute({ kind: 'index_error', back: 'sights' })} />
    );
  } else if (route.tab === 'map') {
    content = <MapScreen />;
  } else {
    content = (
      <>
        {state.sights.length === 0 && reviewerPath}
        <FixScreen
          onSight={() => setRoute({ kind: 'sight', back: currentTab })}
          onMeasureIndexError={() => setRoute({ kind: 'index_error', back: currentTab })}
          onHowItWorks={() => setRoute({ kind: 'how', back: currentTab })}
        />
        {modeControl}
      </>
    );
  }

  return (
    <div
      data-testid="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: COLOURS.bg,
        color: COLOURS.ink,
        fontFamily: BODY_FONT_STACK,
      }}
    >
      {environment.mode === 'simulation' && <SimulationBanner />}
      {environment.mode === 'simulation' && phoneBar}
      <main
        ref={main}
        data-testid="app-main"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: SIZES.gapPx * 1.5,
        }}
      >
        <PrimaryRowProvider value={primaryRow}>{content}</PrimaryRowProvider>
      </main>
      <div
        ref={setPrimaryRow}
        data-testid="primary-row"
        style={{ flex: '0 0 auto', background: COLOURS.bg }}
      />
      {route.kind === 'tab' && <TabBar current={route.tab} onSelect={toTab} />}
    </div>
  );
}

export function App({ environment, store, phoneBar, reviewerPath, modeControl }: AppProps) {
  return (
    <EnvironmentProvider value={environment}>
      <StoreProvider value={store}>
        <Shell
          environment={environment}
          {...(phoneBar === undefined ? {} : { phoneBar })}
          {...(reviewerPath === undefined ? {} : { reviewerPath })}
          {...(modeControl === undefined ? {} : { modeControl })}
        />
      </StoreProvider>
    </EnvironmentProvider>
  );
}
