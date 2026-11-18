// The Playground (Req 18): the camera, the Session, the Reticle, the map and the Simulator panel
// wired together, to try the flow on a phone and on a laptop before either app exists. Everything
// it needs from the browser is passed in (`main.tsx` builds it), so that the integration test runs
// it with the Simulator, a fake Timer, a fake camera and a fake map.
//
// It writes no file, stores nothing, sends nothing and has no analytics (Req 18.7): the only
// requests are the page's own assets and the tiles of the Tile source. Failures are shown only
// through `messageFor` (Req 18.8).

import { BearingModel, solve, type Bearing, type Fix } from '@alidade/core';
import type { SensorResult, SensorSource, SensorSourceOptions } from '@alidade/sensors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaptureSummary,
  COLOURS,
  defaultSessionParameters,
  FailureNotice,
  FixSummary,
  MapView,
  type CameraStartRequest,
  type CameraSurface,
  type CatalogueScene,
  type MapLibreLike,
  type MapObserver,
  type ObserveElementSize,
  type Session,
  type SourceSize,
  type TileSource,
  type Timer,
  type UiFailure,
  type UiResult,
} from '../src/index';
import { CalibrationForm, type CalibrationChoice } from './CalibrationForm';
import { CaptureList, type PlaygroundCapture } from './CaptureList';
import { DeviceMode } from './DeviceMode';
import { Diagnostics } from './Diagnostics';
import { SimulatorMode } from './SimulatorMode';

export type PlaygroundMode = 'device' | 'simulator';

export interface PlaygroundDeps {
  readonly timer: Timer;
  /** Sensors' feature test of `DeviceOrientationEvent`, never the user-agent (Req 18.2). */
  readonly hasDeviceOrientation: boolean;
  readonly tiles: TileSource | null;
  readonly loadMapLibre: () => Promise<UiResult<MapLibreLike>>;
  readonly cameraSurface: CameraSurface;
  readonly createDeviceSource: () => SensorResult<SensorSource>;
  readonly catalogue: UiResult<readonly CatalogueScene[]>;
  readonly sensorOptions: SensorSourceOptions;
  /** How the image's size is read; the default watches the element (tests inject one). */
  readonly observe?: ObserveElementSize;
}

/** How far each bearing line is drawn on the map. */
export const PLAYGROUND_LINE_LENGTH_M = 6000;

const PARAMETERS = defaultSessionParameters();

const modeButton = (active: boolean) =>
  ({
    boxSizing: 'border-box',
    minHeight: 48,
    minWidth: 48,
    padding: '0 16px',
    fontSize: 20,
    fontFamily: 'inherit',
    borderRadius: 0,
    border: `1px solid ${active ? COLOURS.brass : COLOURS.rule}`,
    background: active ? COLOURS.brass : COLOURS.raised,
    color: active ? COLOURS.brassInk : COLOURS.ink,
  }) as const;

export function Playground({ deps }: { readonly deps: PlaygroundDeps }) {
  const [mode, setMode] = useState<PlaygroundMode>(
    deps.hasDeviceOrientation ? 'device' : 'simulator',
  );
  const [choice, setChoice] = useState<CalibrationChoice>({
    calibration: null,
    tapSigmaPx: Number.NaN,
  });
  const [cameraRequest, setCameraRequest] = useState<CameraStartRequest>({});
  const [streamSize, setStreamSize] = useState<SourceSize | null>(null);
  const [captures, setCaptures] = useState<readonly PlaygroundCapture[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [lib, setLib] = useState<MapLibreLike | null>(null);
  const [mapFailure, setMapFailure] = useState<UiFailure | null>(null);
  const lastCaptured = useRef<unknown>(null);
  const { loadMapLibre } = deps;

  useEffect(() => {
    let live = true;
    void loadMapLibre().then((r) => {
      if (!live) return;
      if (r.ok) setLib(r.value);
      else setMapFailure(r);
    });
    return () => {
      live = false;
    };
  }, [loadMapLibre]);

  const onSession = useCallback((s: Session, where: string) => {
    setSession(s);
    if (s.captured !== null && s.captured !== lastCaptured.current) {
      lastCaptured.current = s.captured;
      const result = s.captured;
      setCaptures((list) => [...list, { id: `capture-${list.length + 1}`, where, result }]);
    }
  }, []);

  const switchMode = (next: PlaygroundMode): void => {
    if (next === mode) return;
    setMode(next);
    setCaptures([]);
    setSession(null);
    lastCaptured.current = null;
  };

  // The caller replaces the Session's id (design §7.9): ids are unique for the solver.
  const bearings = useMemo<readonly Bearing[]>(
    () =>
      captures.flatMap((c) =>
        c.result.kind === 'bearing' ? [{ ...c.result.bearing, id: c.id }] : [],
      ),
    [captures],
  );
  const observers = useMemo<readonly MapObserver[]>(
    () => bearings.map((b) => ({ id: b.id, position: b.observer })),
    [bearings],
  );
  const solved = useMemo<UiResult<Fix> | null>(
    () => (bearings.length >= 2 ? solve(new BearingModel(), bearings) : null),
    [bearings],
  );
  const latest = captures[captures.length - 1] ?? null;

  return (
    <main
      data-testid="playground"
      data-mode={mode}
      style={{ background: COLOURS.bg, color: COLOURS.ink }}
    >
      <nav style={{ display: 'flex', gap: 8, padding: 8 }} aria-label="Mode">
        <button
          type="button"
          style={modeButton(mode === 'device')}
          aria-pressed={mode === 'device'}
          onClick={() => switchMode('device')}
        >
          This phone
        </button>
        <button
          type="button"
          style={modeButton(mode === 'simulator')}
          aria-pressed={mode === 'simulator'}
          onClick={() => switchMode('simulator')}
        >
          Simulator
        </button>
      </nav>
      <CalibrationForm
        key={mode}
        mode={mode}
        streamSize={streamSize}
        onApply={setChoice}
        onRequestSize={setCameraRequest}
      />
      {mode === 'device' ? (
        <DeviceMode
          createSource={deps.createDeviceSource}
          cameraSurface={deps.cameraSurface}
          timer={deps.timer}
          parameters={PARAMETERS}
          calibration={choice.calibration}
          tapSigmaPx={choice.tapSigmaPx}
          cameraRequest={cameraRequest}
          onSession={onSession}
          onStreamSize={setStreamSize}
          observe={deps.observe}
        />
      ) : deps.catalogue.ok ? (
        <SimulatorMode
          catalogue={deps.catalogue.value}
          timer={deps.timer}
          parameters={PARAMETERS}
          sensorOptions={deps.sensorOptions}
          tapSigmaPx={choice.tapSigmaPx}
          onSession={onSession}
          observe={deps.observe}
        />
      ) : (
        <FailureNotice failure={deps.catalogue} />
      )}
      {/* Once: the sighting screen shows the summary itself while it is in `captured` (Req 18.4). */}
      {latest !== null && session?.state !== 'captured' && (
        <CaptureSummary result={latest.result} />
      )}
      <CaptureList captures={captures} />
      {solved !== null && <FixSummary fix={solved} />}
      {mapFailure !== null && <FailureNotice failure={mapFailure} />}
      <MapView
        lib={lib}
        tiles={deps.tiles}
        timer={deps.timer}
        observers={observers}
        bearings={bearings}
        lineLengthM={PLAYGROUND_LINE_LENGTH_M}
        fix={solved !== null && solved.ok ? solved.value : null}
      />
      <Diagnostics session={session} parameters={PARAMETERS} />
    </main>
  );
}
