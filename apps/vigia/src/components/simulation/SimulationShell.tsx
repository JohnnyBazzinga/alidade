// The Simulation shell (design D16, §10; Req 17.1, 17.4, 17.5): the page of a reviewer on a laptop
// with no sensor, no camera and no network. It holds one simulated phone for each Station of the
// chosen scene, shows UI's Simulator panel as the source of the Sight screen, and shows the App
// of the phone the panel is on: changing the Station in the panel changes the phone, and the
// others keep their sightings. Every screen is the App's own code.
//
// The Simulator panel holds the scene, the Station, the seed and the running Simulator in its own
// state, so it must outlive the Sight screen, which the App unmounts when the reviewer goes back to
// the Smoke screen. The panel is therefore rendered once, here, into a node that React owns and
// that is moved into the Sight screen while that screen is there and back into a hidden stash
// when it is not. A Session the panel reports reaches the Sight screen that is there; a capture
// that was delivered to one Sight screen is not delivered again to the next.
//
// Task group 21 (skeleton-ui task group 30): the panel is in its compact presentation, for a
// reviewer, and the phone in hand is chosen under the banner on every screen ("You hold the phone
// at"); the shell owns that choice and hands it to the panel as `selectedStationId`.

import {
  SimulatorPanel,
  type CatalogueScene,
  type ObserveElementSize,
  type Session,
  type SessionParameters,
  type SimulatorContext,
} from '@alidade/ui';
import type { SensorSourceOptions } from '@alidade/sensors';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App } from '../../App';
import { reviewerStep, type PostState } from '../../math/texts';
import type { SightingSource, VigiaMode } from '../environment';
import {
  createSimulatedPhones,
  createSimulationClock,
  type SimulatedPhone,
  type SimulationBase,
} from './simulated-phone';

export interface SimulationShellProps {
  /** The scenes of the panel, in order; the first is shown first. */
  readonly catalogue: readonly CatalogueScene[];
  /** The Adapters of the page, shared by every phone. */
  readonly base: SimulationBase;
  readonly sessionParameters: SessionParameters;
  readonly sensorOptions: SensorSourceOptions;
  /** From Sensors' `browserEnvironment()`: the mode control is shown only then (Req 17.1). */
  readonly hasDeviceOrientation: boolean;
  readonly onModeChange?: (mode: VigiaMode) => void;
  readonly observe?: ObserveElementSize;
  /** Sees every Session the panel reports, with its scene and Station (diagnostics and tests). */
  readonly onSession?: (session: Session, context: SimulatorContext) => void;
}

type SessionListener = (session: Session) => void;

/** Where the panel's Sessions go: the Sight screen that is on screen, if any. */
interface PanelBridge {
  /** The node the panel is rendered into; React owns it, the slot moves it. */
  host: HTMLElement | null;
  listener: SessionListener | null;
  latest: Session | null;
  /** The captures already given to a Sight screen. */
  readonly delivered: WeakSet<object>;
}

function createBridge(): PanelBridge {
  return { host: null, listener: null, latest: null, delivered: new WeakSet() };
}

function deliver(bridge: PanelBridge, session: Session): void {
  if (bridge.listener === null) return;
  if (session.state === 'captured' && session.captured !== null) {
    bridge.delivered.add(session.captured);
  }
  bridge.listener(session);
}

/**
 * The place of the panel inside a Sight screen. The Sight screen that mounts it receives the
 * latest Session, unless that is a capture it has already been given.
 */
function PanelSlot({ bridge, listener }: { bridge: PanelBridge; listener: SessionListener }) {
  const slot = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const place = slot.current;
    const host = bridge.host;
    if (place === null || host === null) return undefined;
    const stash = host.parentElement;
    place.appendChild(host);
    return () => {
      stash?.appendChild(host);
    };
  }, [bridge]);

  useEffect(() => {
    bridge.listener = listener;
    const latest = bridge.latest;
    const given =
      latest !== null && latest.captured !== null && bridge.delivered.has(latest.captured);
    if (latest !== null && !(latest.state === 'captured' && given)) deliver(bridge, latest);
    return () => {
      if (bridge.listener === listener) bridge.listener = null;
    };
  }, [bridge, listener]);

  return <div ref={slot} data-testid="simulator-slot" />;
}

interface PhoneSet {
  readonly sceneId: string;
  readonly phones: readonly SimulatedPhone[];
}

export function SimulationShell(props: SimulationShellProps) {
  const { catalogue, hasDeviceOrientation, onModeChange } = props;
  const first = catalogue[0];
  const firstStation = first?.scene.stations[0];
  const firstScript = firstStation === undefined ? undefined : first?.scripts[firstStation.id];

  const [clock] = useState(() => createSimulationClock(firstScript?.startUtcMs ?? 0));
  const [bridge] = useState(createBridge);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [where, setWhere] = useState({
    sceneId: first?.scene.id ?? '',
    stationId: firstStation?.id ?? '',
  });
  const [set, setSet] = useState<PhoneSet | null>(null);

  // The latest props, read by the effect that makes the phones without making it depend on them.
  const latest = useRef(props);
  latest.current = props;

  const entry = catalogue.find((c) => c.scene.id === where.sceneId);

  const hostRef = useCallback(
    (element: HTMLDivElement | null) => {
      bridge.host = element;
      setHost(element);
    },
    [bridge],
  );

  const renderSlot = useCallback(
    (listener: SessionListener) => <PanelSlot bridge={bridge} listener={listener} />,
    [bridge],
  );

  // One set of phones for the scene the panel is on; a new scene is new phones.
  useEffect(() => {
    if (entry === undefined) return undefined;
    const sighting: SightingSource = { kind: 'simulation', render: renderSlot };
    const phones = createSimulatedPhones({
      entry,
      clock: clock.now,
      sighting,
      base: latest.current.base,
    });
    for (const phone of phones) phone.store.start();
    setSet({ sceneId: entry.scene.id, phones });
    return () => {
      for (const phone of phones) phone.stop();
    };
  }, [entry, clock, renderSlot]);

  const onPanelSession = useCallback(
    (session: Session, context: SimulatorContext) => {
      if (session.nowUtcMs !== null) clock.report(session.nowUtcMs);
      setWhere((before) =>
        before.sceneId === context.scene.id && before.stationId === context.station.id
          ? before
          : { sceneId: context.scene.id, stationId: context.station.id },
      );
      bridge.latest = session;
      deliver(bridge, session);
      latest.current.onSession?.(session, context);
    },
    [bridge, clock],
  );

  // While the phones of a new scene are being made, the App stays on the phone it had: it must
  // not be unmounted, or the reviewer would be taken off the Sight screen by choosing a scene.
  const active =
    set === null
      ? null
      : (set.phones.find((p) => p.stationId === where.stationId) ?? set.phones[0] ?? null);

  // Every phone's state, for the reviewer's step line: the shell listens to all the phones' stores.
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (set === null) return undefined;
    const stops = set.phones.map((phone) => phone.store.subscribe(() => setChanges((n) => n + 1)));
    return () => {
      for (const stop of stops) stop();
    };
  }, [set]);
  const progress = useMemo(() => {
    if (set === null || entry === undefined) return undefined;
    const posts: PostState[] = set.phones.map((phone) => {
      const snapshot = phone.store.getSnapshot();
      const fix =
        snapshot.open !== null && snapshot.open.assessment.ok
          ? snapshot.open.assessment.value.fix
          : null;
      return {
        id: phone.stationId,
        name: entry.scene.stations.find((s) => s.id === phone.stationId)?.name ?? '',
        // Its own sightings: one received from another phone was not taken at this post.
        sightings: snapshot.state.incidents.reduce(
          (n, i) => n + i.entries.filter((e) => e.sighting.origin === 'local').length,
          0,
        ),
        waiting: snapshot.inbox.length,
        located: fix !== null && fix.ok,
      };
    });
    // The next post to sight from: this one if its phone has not sighted, else another that has not.
    const here = posts.find((p) => p.id === where.stationId);
    const next =
      here !== undefined && here.sightings === 0
        ? here
        : posts.find((p) => p.id !== where.stationId && p.sightings === 0);
    return {
      step: reviewerStep(posts, where.stationId),
      nextPost: next === undefined ? null : { id: next.id, name: next.name },
    };
    // `changes` is the phones' stores ticking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, entry, where.stationId, changes]);
  const choosePost = useCallback((stationId: string) => {
    setWhere((before) =>
      before.stationId === stationId ? before : { sceneId: before.sceneId, stationId },
    );
  }, []);
  const phoneInHand = useMemo(
    () =>
      entry === undefined
        ? undefined
        : {
            stationId: where.stationId,
            stations: entry.scene.stations.map((s) => ({ id: s.id, name: s.name })),
            onSelect: choosePost,
            ...(progress === undefined ? {} : progress),
          },
    [entry, where.stationId, choosePost, progress],
  );

  return (
    <>
      <div hidden data-testid="simulator-stash">
        <div ref={hostRef} />
      </div>
      {host !== null &&
        createPortal(
          <SimulatorPanel
            catalogue={catalogue}
            timer={props.base.timer}
            parameters={props.sessionParameters}
            sensorOptions={props.sensorOptions}
            tapSigmaPx={props.base.parameters.simulationTapSigmaPx}
            {...(first === undefined ? {} : { initialSceneId: first.scene.id })}
            {...(props.observe === undefined ? {} : { observe: props.observe })}
            onSession={onPanelSession}
            presentation="compact"
            selectedStationId={where.stationId}
          />,
          host,
        )}
      {active !== null && (
        <App
          environment={active.environment}
          store={active.store}
          hasDeviceOrientation={hasDeviceOrientation}
          {...(onModeChange === undefined ? {} : { onModeChange })}
          {...(phoneInHand === undefined ? {} : { phoneInHand })}
        />
      )}
    </>
  );
}
