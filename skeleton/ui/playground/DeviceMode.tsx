// Device mode (Req 18.2): the phone's own sensors through Sensors' `createBrowserSensorSource`,
// and the rear camera through the Camera adapter. The camera and the motion permission are both
// asked from the one Start tap (iOS needs a gesture for each).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SensorResult, SensorSource } from '@alidade/sensors';
import {
  CameraImage,
  createCameraAdapter,
  FailureNotice,
  SightingScreen,
  useSightingSession,
  type ActionRequest,
  type CameraCalibration,
  type CameraStartRequest,
  type CameraStream,
  type CameraSurface,
  type ObserveElementSize,
  type Session,
  type SessionParameters,
  type SourceSize,
  type Timer,
} from '../src/index';

export interface DeviceModeProps {
  readonly createSource: () => SensorResult<SensorSource>;
  readonly cameraSurface: CameraSurface;
  readonly timer: Timer;
  readonly parameters: SessionParameters;
  readonly calibration: CameraCalibration | null;
  readonly tapSigmaPx: number;
  readonly cameraRequest: CameraStartRequest;
  readonly onSession: (session: Session, where: string) => void;
  readonly onStreamSize: (size: SourceSize | null) => void;
  readonly observe?: ObserveElementSize;
}

export function DeviceMode(props: DeviceModeProps) {
  const { createSource, cameraSurface, timer, parameters, onSession, onStreamSize } = props;
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
    if (sighting.session !== null) onSession(sighting.session, 'this phone');
  }, [sighting.session, onSession]);
  useEffect(() => onStreamSize(size), [size, onStreamSize]);

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
    void adapter.start(props.cameraRequest).then((r) => {
      if (r.ok) {
        setStream(r.value);
        setSize(r.value.sizeSourcePx());
        camera({ ok: true, value: null });
      } else {
        camera(r);
      }
    });
  }, [adapter, props.cameraRequest, camera]);

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
