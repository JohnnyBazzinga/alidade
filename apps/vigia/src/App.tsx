// The App (design §9 navigation, D15; Req 1.5, 1.10, 10.3, 17.1, 17.4): the four tabs, the Sight
// screen and the sheets, the Simulation banner, and the Overlays. It is the only importer of
// `./overlays` (the cut build replaces that module by `./overlays-empty`).
//
// The layout is one column the height of the screen: the banner, then the screen, which scrolls,
// then the tab bar, so that the tabs stay under the thumb with no fixed layer over anything
// (skeleton-ui Req 13.13, 18.11). The tabs are hidden on the Sight screen and in a sheet. A sheet
// replaces the screen in the page's flow rather than covering it.
//
// Task group 21 (design §9, note of 2026-11-20): between the part that scrolls and the tab bar is
// the row of the screen's primary action (`PrimaryAction`), so that it is under the thumb however
// long the screen is; in Simulation mode the bar of the phone in hand is under the banner on every
// screen, and the first screen gives the reviewer's path while this phone has sighted nothing.

import { BODY_FONT_STACK, COLOURS } from '@alidade/ui';
import { useEffect, useRef, useState } from 'react';
import { SENT_BACK_TEXT } from './math/texts';
import { EmergencyScreen } from './components/EmergencyScreen';
import {
  EnvironmentProvider,
  useEnvironment,
  type VigiaEnvironment,
  type VigiaMode,
} from './components/environment';
import { InboxSheet } from './components/InboxSheet';
import { LOOK } from './components/look';
import { MapScreen } from './components/MapScreen';
import { PrivacyPage } from './components/PrivacyPage';
import { ShareSheet } from './components/ShareSheet';
import { SightingsScreen } from './components/SightingsScreen';
import { SightScreen } from './components/SightScreen';
import { SimulationBanner } from './components/SimulationBanner';
import { SmokeScreen } from './components/SmokeScreen';
import { StoreProvider, useVigia, type VigiaStore } from './components/store';
import { TabBar, type TabId } from './components/TabBar';
import { Header } from './components/art/Header';
import { HeaderProvider, type HeaderSpec } from './components/header-context';
import { PhoneInHandBar, type PhoneInHand } from './components/PhoneInHandBar';
import { PrimaryRowProvider } from './components/PrimaryAction';
import { ReviewerPath } from './components/ReviewerPath';
import { OVERLAYS } from './overlays';
import { useOverlaySlot } from './overlays/shared/components/OverlayPanel';

/** The App's column at most (Mira's design is drawn at 390; a large phone is 430). */
export const APP_MAX_WIDTH_PX = 480;

export interface AppProps {
  readonly environment: VigiaEnvironment;
  readonly store: VigiaStore;
  /** From Sensors' `browserEnvironment()`: the mode control is shown only then (Req 17.1). */
  readonly hasDeviceOrientation: boolean;
  readonly onModeChange?: (mode: VigiaMode) => void;
  /** In Simulation mode: which simulated phone is in hand, and the control that changes it. */
  readonly phoneInHand?: PhoneInHand;
}

type Route =
  | {
      readonly kind: 'tab';
      readonly tab: TabId;
      /** The Smoke screen right after a capture: "Sighting saved" and "Send this sighting" (Req 4.11). */
      readonly saved?: string;
      /** The Smoke screen right after a join, an add or a new smoke: its one line (Req 4.12). */
      readonly line?: string;
    }
  | { readonly kind: 'sight' }
  | { readonly kind: 'share'; readonly sightingId: string; readonly back: TabId }
  | { readonly kind: 'inbox'; readonly back: TabId }
  | {
      readonly kind: 'privacy';
      readonly back: Exclude<Route, { readonly kind: 'privacy' }>;
    };

function ModeControl({
  mode,
  onModeChange,
}: {
  readonly mode: VigiaMode;
  readonly onModeChange: (mode: VigiaMode) => void;
}) {
  const option = (which: VigiaMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === which}
      onClick={() => {
        if (mode !== which) onModeChange(which);
      }}
      style={{
        ...LOOK.button,
        flex: '1 1 0',
        ...(mode === which
          ? { border: 'none', background: COLOURS.ink, color: COLOURS.panel, fontWeight: 800 }
          : {}),
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      data-testid="mode-control"
      role="group"
      aria-label="Where the sightings come from"
      style={LOOK.stack}
    >
      <p style={LOOK.dim}>Where the sightings come from</p>
      <div style={LOOK.controls}>
        {option('device', 'This phone')}
        {option('simulation', 'Simulator')}
      </div>
    </div>
  );
}

/**
 * The header of a route (Req 22.2 as amended 2026-11-27): Mira's row of the mark and the pill on
 * the four tabs; none on the Sight screen and on the views opened from a tab, which say what they
 * are in their own title.
 */
function headerFor(route: Route): HeaderSpec {
  return route.kind === 'tab' ? { variant: 'full' } : { variant: 'none' };
}

function Shell({
  hasDeviceOrientation,
  onModeChange,
  phoneInHand,
}: Omit<AppProps, 'environment' | 'store'>) {
  const environment = useEnvironment();
  const snapshot = useVigia();
  const [route, setRoute] = useState<Route>({ kind: 'tab', tab: 'smoke' });
  const seenArrivals = useRef(0);
  const main = useRef<HTMLElement | null>(null);
  const [primaryRow, setPrimaryRow] = useState<HTMLDivElement | null>(null);
  const slot = useOverlaySlot(OVERLAYS, environment, snapshot.open);
  // A view may set the header while it is shown (the question after a capture, the QR view).
  const [headerOverride, setHeaderOverride] = useState<HeaderSpec | null>(null);

  // A code that arrived in the page's address opens the Inbox sheet over the Smoke screen.
  useEffect(() => {
    if (snapshot.linkArrivals > seenArrivals.current) {
      seenArrivals.current = snapshot.linkArrivals;
      setRoute({ kind: 'inbox', back: 'smoke' });
    }
  }, [snapshot.linkArrivals]);

  // Every screen opens at its top: the first thing to do is the first thing on it.
  useEffect(() => {
    if (main.current !== null) main.current.scrollTop = 0;
  }, [route]);

  const toTab = (tab: TabId) => setRoute({ kind: 'tab', tab });
  const singleSighting =
    snapshot.open !== null &&
    snapshot.open.assessment.ok &&
    snapshot.open.assessment.value.used.length === 1 &&
    !(snapshot.open.assessment.value.fix !== null && snapshot.open.assessment.value.fix.ok);
  const currentTab: TabId = route.kind === 'tab' ? route.tab : 'smoke';
  const inbox = () => setRoute({ kind: 'inbox', back: currentTab });
  const privacy = () => {
    if (route.kind !== 'privacy') setRoute({ kind: 'privacy', back: route });
  };

  const post =
    phoneInHand === undefined || environment.mode !== 'simulation'
      ? undefined
      : phoneInHand.stations.find((s) => s.id === phoneInHand.stationId);
  const reviewerPath =
    post !== undefined && snapshot.state.incidents.length === 0 ? (
      <ReviewerPath postName={post.name} />
    ) : null;

  let content;
  if (route.kind === 'sight') {
    content = (
      <SightScreen
        windShown={slot?.windShown ?? false}
        onBack={() => toTab('smoke')}
        onAdded={(sightingId) => setRoute({ kind: 'tab', tab: 'smoke', saved: sightingId })}
        {...(hasDeviceOrientation && onModeChange !== undefined
          ? { onTrySimulator: () => onModeChange('simulation') }
          : {})}
      />
    );
  } else if (route.kind === 'share') {
    content = (
      <ShareSheet
        sightingId={route.sightingId}
        onClose={() =>
          // With one sighting and no position, the Smoke screen says what to wait for (Req 22.18).
          route.back === 'smoke' && singleSighting
            ? setRoute({ kind: 'tab', tab: 'smoke', line: SENT_BACK_TEXT })
            : toTab(route.back)
        }
        onPrivacy={privacy}
      />
    );
  } else if (route.kind === 'inbox') {
    content = (
      <InboxSheet
        onClose={() => toTab(route.back)}
        onTaken={(line) => setRoute({ kind: 'tab', tab: 'smoke', line })}
      />
    );
  } else if (route.kind === 'privacy') {
    content = <PrivacyPage onBack={() => setRoute(route.back)} />;
  } else if (route.tab === 'sightings') {
    content = (
      <SightingsScreen
        onShare={(sightingId) => setRoute({ kind: 'share', sightingId, back: 'sightings' })}
        onInbox={inbox}
      />
    );
  } else if (route.tab === 'map') {
    content = <MapScreen overlays={slot} />;
  } else if (route.tab === 'emergency') {
    content = <EmergencyScreen />;
  } else {
    content = (
      <SmokeScreen
        onSight={() => setRoute({ kind: 'sight' })}
        onShowMap={() => toTab('map')}
        onSend={(sightingId) => setRoute({ kind: 'share', sightingId, back: 'smoke' })}
        {...(route.saved === undefined ? {} : { saved: { sightingId: route.saved } })}
        {...(route.line === undefined ? {} : { statusLine: route.line })}
        onInbox={inbox}
        onPrivacy={privacy}
        {...(reviewerPath === null ? {} : { reviewerPath })}
        modeControl={
          hasDeviceOrientation && onModeChange !== undefined ? (
            <ModeControl mode={environment.mode} onModeChange={onModeChange} />
          ) : undefined
        }
      />
    );
  }

  const header = headerOverride ?? headerFor(route);
  return (
    <div
      data-testid="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        // Mira is a phone's design (Req 22.16): on a wide screen the App is a column of a phone's
        // width, in the middle of the page, as a reviewer on a laptop sees it.
        width: '100%',
        maxWidth: APP_MAX_WIDTH_PX,
        margin: '0 auto',
        background: COLOURS.bg,
        color: COLOURS.ink,
        fontFamily: BODY_FONT_STACK,
      }}
    >
      {header.variant === 'full' && <Header onEmergency={() => toTab('emergency')} />}
      {environment.mode === 'simulation' && <SimulationBanner />}
      {environment.mode === 'simulation' && phoneInHand !== undefined && (
        <PhoneInHandBar hand={phoneInHand} />
      )}
      <main
        ref={main}
        data-testid="app-main"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          // The phone's Sight screen is the whole column, `100dvh` high (Req 3.10, D23.1): any
          // padding would make the page scroll.
          padding:
            route.kind === 'sight' && environment.mode === 'device'
              ? 0
              : `${route.kind === 'tab' ? 16 : 28}px 20px 16px`,
        }}
      >
        <HeaderProvider value={setHeaderOverride}>
          <PrimaryRowProvider value={primaryRow}>{content}</PrimaryRowProvider>
        </HeaderProvider>
      </main>
      <div
        ref={setPrimaryRow}
        data-testid="primary-row"
        style={{ flex: '0 0 auto', background: COLOURS.bg }}
      />
      {route.kind === 'tab' && (
        <TabBar current={route.tab} inboxCount={snapshot.inbox.length} onSelect={toTab} />
      )}
    </div>
  );
}

export function App({
  environment,
  store,
  hasDeviceOrientation,
  onModeChange,
  phoneInHand,
}: AppProps) {
  return (
    <EnvironmentProvider value={environment}>
      <StoreProvider value={store}>
        <Shell
          hasDeviceOrientation={hasDeviceOrientation}
          {...(onModeChange === undefined ? {} : { onModeChange })}
          {...(phoneInHand === undefined ? {} : { phoneInHand })}
        />
      </StoreProvider>
    </EnvironmentProvider>
  );
}
