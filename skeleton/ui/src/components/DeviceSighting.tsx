// The phone's own sensors and rear camera on the sighting screen (Req 18.10; G6 of the Vigia
// design). The Sensor source comes from `createSource` (Sensors' `createBrowserSensorSource`, in an
// app), the rear camera from the Camera adapter, and both are started by the one Start tap (iOS
// needs a gesture for each). The camera and the source are stopped when the component unmounts.
// It carries nothing of the Playground: the caller says what to do with the Session and the size
// of the stream.

import type { SensorResult, SensorSource } from '@alidade/sensors';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCameraAdapter,
  type CameraStartRequest,
  type CameraStream,
} from '../adapters/camera/camera-adapter';
import type { CameraSurface } from '../adapters/camera/camera-surface';
import type { CameraCalibration } from '../math/camera-calibration';
import type { SourceSize } from '../math/image-layout';
import type { SessionParameters } from '../math/session/parameters';
import type { Session } from '../math/session/session';
import type { ActionRequest } from '../math/session/session-events';
import { CameraImage } from './CameraImage';
import type { ObserveElementSize } from './dom-size';
import { FailureNotice } from './FailureNotice';
import { SightingScreen } from './SightingScreen';
import type { Timer } from './timer';
import { useSightingSession } from './use-sighting-session';

export interface DeviceSightingProps {
  /** Must be stable between renders: a new function makes a new source. */
  readonly createSource: () => SensorResult<SensorSource>;
  readonly cameraSurface: CameraSurface;
  readonly timer: Timer;
  /** Must be stable between renders: a new object restarts the Session. */
  readonly parameters: SessionParameters;
  /** `null` until the field of view is known: a Mark is then refused (`calibration_missing`). */
  readonly calibration: CameraCalibration | null;
  /** The tap's 1-sigma in CSS pixels; with a value that is not a number the calibration is withheld. */
  readonly tapSigmaPx: number;
  /** The camera's requested size; the default asks for the rear camera and nothing else. */
  readonly cameraRequest?: CameraStartRequest;
  /** Called with every new Session. */
  readonly onSession?: (session: Session) => void;
  /** Called with the running stream's size, and with `null` when there is none. */
  readonly onStreamSize?: (size: SourceSize | null) => void;
  readonly observe?: ObserveElementSize;
}

const NO_REQUEST: CameraStartRequest = {};

export function DeviceSighting(props: DeviceSightingProps) {
  const { createSource, cameraSurface, timer, parameters, onSession, onStreamSize } = props;
  const cameraRequest = props.cameraRequest ?? NO_REQUEST;
  const created = useMemo(() => createSource(), [createSource]);
  const source = created.ok ? created.value : null;
  const adapter = useMemo(() => createCameraAdapter(cameraSurface), [cameraSurface]);
  const [stream, setStream] = useState<CameraStream | null>(null);
  const [size, setSize] = useState<SourceSize | null>(null);
  const sighting = useSightingSession({ source, kind: 'bearing', parameters, timer });
  const { camera } = sighting;

  useEffect(() => () => source?.stop(), [source]);
  useEffect(() => () => adapter.stop(), [adapter]);
  useEffect(() => {
    if (sighting.session !== null) onSession?.(sighting.session);
  }, [sighting.session, onSession]);
  useEffect(() => onStreamSize?.(size), [size, onStreamSize]);

  useEffect(() => {
    if (stream === null) return undefined;
    const stopEnded = stream.onEnded((failure) => {
      setStream(null);
      camera(failure);
    });
    const stopSize = stream.onSize(setSize);
    return () => {
      stopEnded();
      stopSize();
    };
  }, [stream, camera]);

  const startCamera = useCallback(() => {
    void adapter.start(cameraRequest).then((r) => {
      if (r.ok) {
        setStream(r.value);
        setSize(r.value.sizeSourcePx());
        camera({ ok: true, value: null });
      } else {
        camera(r);
      }
    });
  }, [adapter, cameraRequest, camera]);

  // One tap: the motion permission is asked synchronously, the camera right after it (D4).
  const start = (): void => {
    sighting.requestPermission();
    startCamera();
  };
  const onAction = (action: ActionRequest): void => {
    sighting.dispatch(action);
    if (action.kind === 'restart' && stream === null) startCamera();
  };

  if (!created.ok) return <FailureNotice failure={created} />;
  if (sighting.session === null) return null;
  return (
    <SightingScreen
      session={sighting.session}
      parameters={parameters}
      onRequestPermission={start}
      onAction={onAction}
      sourceSize={size}
      fit="cover"
      calibration={
        Number.isFinite(props.tapSigmaPx) && props.tapSigmaPx >= 0 ? props.calibration : null
      }
      tapSigmaPx={props.tapSigmaPx}
      observe={props.observe}
      renderImage={(_layout, frozen) => <CameraImage stream={stream} frozen={frozen} fit="cover" />}
    />
  );
}
