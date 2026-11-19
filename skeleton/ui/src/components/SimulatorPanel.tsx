// The Simulator panel (Req 17, design D15, §7.15): a reviewer on a laptop picks a scripted scene,
// a Station, a seed and a speed, and plays, pauses, steps or restarts it. The panel drives the
// Simulator's clock only through `advanceTo`, from the injected Timer; a change of scene, Station
// or seed (or a restart) makes a new source and a new Session and stops the old ones. The Scene
// image replaces the camera image, and the truth of the scene is shown as text.

import {
  createSimulator,
  type DeviceRotation,
  type SensorSourceOptions,
  type SimulatorControls,
} from '@alidade/sensors';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { displayedFocalPx } from '../math/image-geometry';
import type { ImageLayout } from '../math/image-layout';
import { fromDeg } from '../math/degrees';
import { SIMULATOR_TICK_MS } from '../defaults';
import { formatAzimuthDeg, formatSignedDeg } from '../math/display-format';
import { messageFor } from '../math/messages';
import { panelStep, type PanelAction, type PanelState } from '../math/panel/panel-state';
import { aimAfterDrag } from '../math/scene/aim';
import type { CatalogueScene } from '../math/scene/catalogue';
import { projectScene, type ProjectedScene } from '../math/scene/project-scene';
import type { Station, SyntheticScene } from '../math/scene/scene';
import { targetDirection } from '../math/scene/target-direction';
import type { SessionParameters } from '../math/session/parameters';
import type { Session } from '../math/session/session';
import type { UiFailure } from '../result';
import { controlStyle } from './ControlBar';
import type { ObserveElementSize } from './dom-size';
import { FailureNotice } from './FailureNotice';
import type { AimGesture } from './ImageSurface';
import { SceneImage } from './SceneImage';
import { SightingScreen } from './SightingScreen';
import { COLOURS, FONT_STACK, SIZES } from './theme';
import type { Timer } from './timer';
import { useSightingSession } from './use-sighting-session';

/** One arrow-key press aims this far (Req 17.10): 1°. */
const AIM_KEY_STEP_RAD = fromDeg(1);
const SPEEDS = [0.25, 1, 4] as const;

export interface SimulatorContext {
  readonly scene: SyntheticScene;
  readonly station: Station;
  readonly kind: 'bearing' | 'altitude';
}

export interface SimulatorPanelProps {
  readonly catalogue: readonly CatalogueScene[];
  readonly timer: Timer;
  readonly parameters: SessionParameters;
  readonly sensorOptions: SensorSourceOptions;
  /** The 1-sigma of a tap in CSS pixels; `NaN` while the user has not given one. */
  readonly tapSigmaPx: number;
  readonly initialSceneId?: string;
  readonly observe?: ObserveElementSize;
  /** Called with the Session after every change, and with the scene and Station it is for. */
  readonly onSession?: (session: Session, context: SimulatorContext) => void;
  /** Extra content under the image, for example the Playground's diagnostics. */
  readonly children?: ReactNode;
}

function initialPanelState(entry: CatalogueScene): PanelState | null {
  const station = entry.scene.stations[0];
  const script = station === undefined ? undefined : entry.scripts[station.id];
  if (station === undefined || script === undefined) return null;
  return {
    sceneId: entry.scene.id,
    stationId: station.id,
    seed: 1,
    speed: 1,
    playing: false,
    elapsedSimMs: 0,
    tickMs: SIMULATOR_TICK_MS,
    startUtcMs: script.startUtcMs,
  };
}

export function SimulatorPanel(props: SimulatorPanelProps) {
  const { catalogue, timer, parameters, sensorOptions, onSession } = props;
  const first = catalogue.find((c) => c.scene.id === props.initialSceneId) ?? catalogue[0] ?? null;
  const [panel, setPanel] = useState<PanelState | null>(() =>
    first === null ? null : initialPanelState(first),
  );
  const panelRef = useRef(panel);
  const [generation, setGeneration] = useState(0);
  const [, setRenderTick] = useState(0);
  const [failure, setFailure] = useState<UiFailure | null>(null);
  const [seedText, setSeedText] = useState('1');
  const [layout, setLayout] = useState<ImageLayout | null>(null);
  const frozenRotation = useRef<DeviceRotation | null>(null);

  const entry = catalogue.find((c) => c.scene.id === panel?.sceneId) ?? null;
  const station = entry?.scene.stations.find((s) => s.id === panel?.stationId) ?? null;

  // A new Simulator for each scene, Station, seed and restart (Req 17.4).
  // `panel` changes with every tick; only the scenario's identity is a dependency here.
  // `generation` is bumped by a restart, which keeps the same scene, Station and seed.
  const seed = panel?.seed ?? null;
  const sim = useMemo(() => {
    void generation;
    if (entry === null || station === null || seed === null) return null;
    const script = entry.scripts[station.id];
    if (script === undefined) return null;
    return createSimulator(script, seed, sensorOptions);
  }, [entry, station, seed, generation, sensorOptions]);
  const controls: SimulatorControls | null = sim?.ok ? sim.value.controls : null;
  const source = sim?.ok ? sim.value.source : null;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const creationFailure: UiFailure | null = sim !== null && !sim.ok ? sim : null;

  useEffect(() => {
    return () => source?.stop();
  }, [source]);

  const sighting = useSightingSession({
    source,
    kind: entry?.kind ?? 'bearing',
    parameters,
    timer,
  });
  const session = sighting.session;

  useEffect(() => {
    if (session !== null && entry !== null && station !== null) {
      onSession?.(session, { scene: entry.scene, station, kind: entry.kind });
    }
  }, [session, entry, station, onSession]);

  // The Simulator's clock moves only here (Req 17.5).
  const apply = useCallback((action: PanelAction): void => {
    const current = panelRef.current;
    if (current === null) return;
    const stepped = panelStep(current, action);
    if (!stepped.ok) {
      setFailure(stepped);
      return;
    }
    let next = stepped.value.state;
    let advanceFailure: UiFailure | null = null;
    for (const timeUtcMs of stepped.value.advancesToUtcMs) {
      const advanced = controlsRef.current?.advanceTo(timeUtcMs);
      if (advanced !== undefined && !advanced.ok) {
        advanceFailure = advanced;
        next = { ...next, playing: false };
        break;
      }
    }
    panelRef.current = next;
    setPanel(next);
    setFailure(advanceFailure);
    if (stepped.value.recreate) setGeneration((g) => g + 1);
    setRenderTick((n) => n + 1);
  }, []);

  const playing = panel?.playing === true;
  const tickMs = panel?.tickMs ?? SIMULATOR_TICK_MS;
  useEffect(() => {
    if (!playing) return undefined;
    const handle = timer.start(() => apply({ kind: 'tick' }), tickMs);
    return () => timer.stop(handle);
  }, [playing, tickMs, timer, apply]);

  const onAim = useCallback(
    (gesture: AimGesture): void => {
      const c = controlsRef.current;
      if (c === null || layout === null || entry === null) return;
      const focal = displayedFocalPx(layout, entry.scene.calibration);
      if (!focal.ok) return setFailure(focal);
      const pose = c.truePose();
      let dxPx: number;
      let dyPx: number;
      if (gesture.kind === 'drag') {
        dxPx = gesture.dxPx;
        dyPx = gesture.dyPx;
      } else {
        // The drag that gives exactly one step of azimuth (the inverse of the cos h factor).
        dxPx =
          -focal.value *
          Math.tan(gesture.azimuthSteps * AIM_KEY_STEP_RAD * Math.cos(pose.apparentAltitudeRad));
        dyPx = focal.value * Math.tan(gesture.altitudeSteps * AIM_KEY_STEP_RAD);
      }
      const aimed = aimAfterDrag(pose, dxPx, dyPx, focal.value);
      if (!aimed.ok) return setFailure(aimed);
      const done = c.aim(aimed.value);
      setFailure(done.ok ? null : done);
      setRenderTick((n) => n + 1);
    },
    [layout, entry],
  );

  if (panel === null || entry === null || station === null) return null;

  const frozen = session?.state === 'frozen';
  if (!frozen) frozenRotation.current = null;

  const renderImage = (imageLayout: ImageLayout | null): ReactNode => {
    let projected: ProjectedScene | null = null;
    if (imageLayout !== null && controls !== null) {
      const live = controls.trueRotation();
      let rotation: DeviceRotation | null = null;
      if (frozen && frozenRotation.current !== null) rotation = frozenRotation.current;
      else if (live.ok) {
        rotation = live.value;
        if (frozen) frozenRotation.current = rotation;
      }
      if (rotation !== null) {
        const result = projectScene(entry.scene, station, rotation, imageLayout);
        if (result.ok) projected = result.value;
      }
    }
    return <SceneImage projected={projected} layout={imageLayout} />;
  };

  const act = (action: PanelAction) => () => apply(action);
  const button = (label: string, action: PanelAction, disabled = false) => (
    <button type="button" style={controlStyle(false)} disabled={disabled} onClick={act(action)}>
      {label}
    </button>
  );
  const shownFailure = failure ?? creationFailure ?? sighting.failure;
  const pose = controls?.truePose() ?? null;

  const labelStyle = {
    display: 'flex',
    flexDirection: 'column',
    fontFamily: FONT_STACK,
    fontSize: SIZES.labelPx,
    color: COLOURS.ink,
  } as const;
  const fieldStyle = {
    boxSizing: 'border-box',
    height: SIZES.touchPx,
    minWidth: SIZES.touchPx,
    fontFamily: FONT_STACK,
    fontSize: SIZES.labelPx,
    background: COLOURS.raised,
    color: COLOURS.ink,
    border: `1px solid ${COLOURS.rule}`,
    borderRadius: 0,
  } as const;

  return (
    <div data-testid="simulator-panel" style={{ background: COLOURS.bg }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SIZES.gapPx, padding: SIZES.gapPx }}>
        <label style={labelStyle}>
          Scene
          <select
            style={fieldStyle}
            value={panel.sceneId}
            onChange={(e) => {
              const chosen = catalogue.find((c) => c.scene.id === e.target.value);
              const st = chosen?.scene.stations[0];
              const script = st === undefined ? undefined : chosen?.scripts[st.id];
              if (chosen === undefined || st === undefined || script === undefined) return;
              apply({
                kind: 'selectScene',
                sceneId: chosen.scene.id,
                stationId: st.id,
                startUtcMs: script.startUtcMs,
              });
            }}
          >
            {catalogue.map((c) => (
              <option key={c.scene.id} value={c.scene.id}>
                {c.scene.name}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Station
          <select
            style={fieldStyle}
            value={panel.stationId}
            onChange={(e) => apply({ kind: 'selectStation', stationId: e.target.value })}
          >
            {entry.scene.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Seed
          <input
            style={fieldStyle}
            inputMode="numeric"
            value={seedText}
            onChange={(e) => {
              setSeedText(e.target.value);
              const text = e.target.value.trim();
              apply({ kind: 'setSeed', seed: text === '' ? Number.NaN : Number(text) });
            }}
          />
        </label>
        <label style={labelStyle}>
          Speed
          <select
            style={fieldStyle}
            value={String(panel.speed)}
            onChange={(e) => {
              const speed = SPEEDS.find((s) => String(s) === e.target.value);
              if (speed !== undefined) apply({ kind: 'setSpeed', speed });
            }}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={String(s)}>
                {`${s}×`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SIZES.gapPx, padding: SIZES.gapPx }}>
        {button('Play', { kind: 'play' }, panel.playing)}
        {button('Pause', { kind: 'pause' }, !panel.playing)}
        {button('Step', { kind: 'step' }, panel.playing)}
        {button('Restart', { kind: 'restart' })}
      </div>
      {shownFailure !== null && <FailureNotice failure={shownFailure} />}
      <p
        data-testid="scene-description"
        style={{ ...labelStyle, margin: 0, padding: SIZES.gapPx, color: COLOURS.inkDim }}
      >
        {entry.description}
      </p>
      <div
        data-testid="truth"
        style={{ ...labelStyle, padding: SIZES.gapPx, background: COLOURS.panel }}
      >
        {pose !== null && (
          <p style={{ margin: 0 }} data-part="camera">
            {`Camera: azimuth ${formatAzimuthDeg(pose.azimuthRad, 1)}° true, altitude ${formatSignedDeg(pose.apparentAltitudeRad, 1)}°`}
          </p>
        )}
        {entry.scene.targets.map((t) => {
          const d = targetDirection(station, t);
          return (
            <p key={t.id} style={{ margin: 0 }} data-part="target" data-target-id={t.id}>
              {d.ok
                ? `${t.label}: azimuth ${formatAzimuthDeg(d.value.azimuthRad, 1)}° true, altitude ${formatSignedDeg(d.value.apparentAltitudeRad, 1)}°`
                : `${t.label}: ${messageFor(d).whatHappened}`}
            </p>
          );
        })}
      </div>
      {/* No box of fixed height around the screen: it is as tall as its content (Req 13.13). */}
      {session !== null && (
        <div>
          <SightingScreen
            session={session}
            parameters={parameters}
            onRequestPermission={sighting.requestPermission}
            onAction={sighting.dispatch}
            sourceSize={{
              widthSourcePx: entry.scene.calibration.imageWidthSourcePx,
              heightSourcePx: entry.scene.calibration.imageHeightSourcePx,
            }}
            fit="cover"
            // Req 18.3: a Mark is refused with `calibration_missing` until the tap's 1-sigma is
            // valid too; in simulator mode the field of view is the scene's.
            calibration={
              Number.isFinite(props.tapSigmaPx) && props.tapSigmaPx >= 0
                ? entry.scene.calibration
                : null
            }
            tapSigmaPx={props.tapSigmaPx}
            renderImage={renderImage}
            onAim={frozen ? undefined : onAim}
            onLayout={setLayout}
            observe={props.observe}
            imageLabel="Scene image"
          />
        </div>
      )}
      {props.children}
    </div>
  );
}
