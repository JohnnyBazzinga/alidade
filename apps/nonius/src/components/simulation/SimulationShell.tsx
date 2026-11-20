// The Simulation shell (design §10, D20; Req 13): one store over the simulation's own storage, one
// environment per Sight time, UI's Simulator panel in its compact presentation on the Sight screen
// and the phone bar under the banner. The Comparison and the Index error take the scene's truth and
// ask no Sensor source.

import { POSITION_CONFIDENCE_SCALE, type SensorSourceOptions } from '@alidade/sensors';
import {
  SimulatorPanel,
  type ObserveElementSize,
  type Session,
  type SessionParameters,
  type SimulatorContext,
  type TileSource,
} from '@alidade/ui';
import { useCallback, useMemo, useState } from 'react';
import type { NoniusStorage } from '../../adapters/storage';
import type { NoniusParameters } from '../../math/parameters';
import { catalogueSceneAt, type NoniusScene } from '../../math/scenes/sun-scenes';
import { ok, type NoniusFailure } from '../../result';
import { App } from '../../App';
import type { NoniusEnvironment, NoniusMode, TileSourceNote } from '../environment';
import { FailureNotice } from '../FailureNotice';
import { ModeControl } from '../ModeControl';
import { createNoniusStore } from '../store';
import { ReviewerPath } from './ReviewerPath';
import { SightTimeBar, SightTimeNote } from './SightTimeBar';

/** The Adapters and settings of the page, shared by every scene. */
export interface SimulationBase {
  readonly parameters: NoniusParameters;
  readonly timer: NoniusEnvironment['timer'];
  /** The simulation's own storage (`nonius.simulation.state`): never the phone's. */
  readonly storage: NoniusStorage;
  readonly loadMap: NoniusEnvironment['loadMap'];
  readonly tiles: TileSource | null;
  readonly tilesFailure: NoniusFailure | null;
  readonly tileSourceNote?: TileSourceNote | undefined;
}

export interface SimulationShellProps {
  readonly scenes: readonly NoniusScene[];
  readonly base: SimulationBase;
  readonly sessionParameters: SessionParameters;
  readonly sensorOptions: SensorSourceOptions;
  /** From Sensors' `browserEnvironment()`: the mode control is shown only then (Req 13.1). */
  readonly hasDeviceOrientation: boolean;
  readonly onModeChange?: (mode: NoniusMode) => void;
  readonly observe?: ObserveElementSize;
  /** Sees every Session the panel reports, with its scene and Station (diagnostics and tests). */
  readonly onSession?: (session: Session, context: SimulatorContext) => void;
}

/** The simulated "now" is this long after the current Sight time, so that ages and advice are read from just after it. Unit: ms. */
const NOW_AFTER_SIGHT_MS = 60_000;

function makeStore(
  scene: NoniusScene,
  base: SimulationBase,
  environment: NoniusEnvironment,
  keepSaved: boolean,
) {
  if (!keepSaved) {
    base.storage.remove();
    base.storage.removeBackup();
  }
  const store = createNoniusStore(environment);
  const state = store.getSnapshot().state;
  // A scene that has its own Index error record starts with it; saved data of a reload is kept.
  if (scene.indexError !== null && state.sights.length === 0 && state.indexError === null) {
    store.dispatch({ kind: 'save_index_error', indexError: scene.indexError });
  }
  return store;
}

export function SimulationShell(props: SimulationShellProps) {
  const { scenes, base, hasDeviceOrientation, onModeChange } = props;
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sightIndex, setSightIndex] = useState(0);
  const scene = scenes[sceneIndex] ?? scenes[0];

  const environmentFor = useCallback(
    (
      forScene: NoniusScene,
      k: number,
      sighting: NoniusEnvironment['sighting'],
    ): NoniusEnvironment => ({
      mode: 'simulation',
      parameters: base.parameters,
      clock: () => (forScene.sightTimesUtcMs[k] ?? 0) + NOW_AFTER_SIGHT_MS,
      timer: base.timer,
      storage: base.storage,
      askLocation: () => {
        const accuracyM = base.parameters.simulationLocationAccuracyM;
        return Promise.resolve(
          ok({
            position: forScene.truth,
            reportedAccuracyM: accuracyM,
            sigmaM: accuracyM / POSITION_CONFIDENCE_SCALE,
            timeUtcMs: (forScene.sightTimesUtcMs[k] ?? 0) + NOW_AFTER_SIGHT_MS,
          }),
        );
      },
      simulatedTruth: forScene.truth,
      loadMap: base.loadMap,
      tiles: base.tiles,
      tilesFailure: base.tilesFailure,
      ...(base.tileSourceNote === undefined ? {} : { tileSourceNote: base.tileSourceNote }),
      sighting,
    }),
    [base],
  );

  const [store, setStore] = useState(() => {
    const first = scenes[0];
    if (first === undefined) throw new Error('no scene');
    return makeStore(
      first,
      base,
      environmentFor(first, 0, { kind: 'simulation', render: () => null }),
      true,
    );
  });

  const built = useMemo(
    () => (scene === undefined ? null : catalogueSceneAt(scene, sightIndex, base.parameters)),
    [scene, sightIndex, base.parameters],
  );

  const environment = useMemo(() => {
    if (scene === undefined) return null;
    return environmentFor(scene, sightIndex, {
      kind: 'simulation',
      render: (onSession) =>
        built === null || !built.ok ? (
          built !== null && !built.ok ? (
            <FailureNotice failure={built} />
          ) : null
        ) : (
          <SimulatorPanel
            key={built.value.scene.id}
            catalogue={[built.value]}
            timer={base.timer}
            parameters={props.sessionParameters}
            sensorOptions={props.sensorOptions}
            tapSigmaPx={base.parameters.simulationTapSigmaPx}
            initialSceneId={built.value.scene.id}
            selectedStationId={`sight-${sightIndex + 1}`}
            presentation="compact"
            hideSceneChooser
            {...(props.observe === undefined ? {} : { observe: props.observe })}
            onSession={(session, context) => {
              onSession(session);
              props.onSession?.(session, context);
            }}
          >
            <SightTimeNote sightTimesUtcMs={scene.sightTimesUtcMs} sightIndex={sightIndex} />
          </SimulatorPanel>
        ),
    });
  }, [scene, sightIndex, built, base, environmentFor, props]);

  if (scene === undefined || environment === null) return null;

  const chooseScene = (sceneId: string): void => {
    const index = scenes.findIndex((s) => s.id === sceneId);
    const next = scenes[index];
    if (next === undefined || index === sceneIndex) return;
    setSceneIndex(index);
    setSightIndex(0);
    setStore(
      makeStore(
        next,
        base,
        environmentFor(next, 0, { kind: 'simulation', render: () => null }),
        false,
      ),
    );
  };

  return (
    <App
      environment={environment}
      store={store}
      phoneBar={
        <SightTimeBar
          scenes={scenes.map((s) => ({ id: s.id, shortName: s.shortName }))}
          sceneId={scene.id}
          sightTimesUtcMs={scene.sightTimesUtcMs}
          sightIndex={sightIndex}
          onScene={chooseScene}
          onSightIndex={setSightIndex}
        />
      }
      reviewerPath={<ReviewerPath />}
      {...(hasDeviceOrientation && onModeChange !== undefined
        ? { modeControl: <ModeControl mode="simulation" onModeChange={onModeChange} /> }
        : {})}
    />
  );
}
