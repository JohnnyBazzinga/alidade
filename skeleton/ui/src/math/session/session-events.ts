// Session events and effects (Req 8.2, 8.4, design §6, D3, D5). Every event carries `timeUtcMs`
// from the source's Clock. Action events are what the user does; data events are what arrives.

import type {
  FrameResetEvent,
  OrientationFrame,
  OrientationSample,
  PositionFix,
  Declination,
  SensorResult,
} from '@alidade/sensors';
import type { UiResult } from '../../result';
import type { CameraCalibration } from '../camera-calibration';
import type { ImageLayout, PixelPoint } from '../image-layout';

export type DataEvent =
  | {
      readonly kind: 'permissionResult';
      readonly timeUtcMs: number;
      readonly result: SensorResult<'granted' | 'not_required'>;
    }
  | {
      readonly kind: 'orientationStarted';
      readonly timeUtcMs: number;
      readonly result: SensorResult<OrientationFrame>;
    }
  | {
      readonly kind: 'sample';
      readonly timeUtcMs: number;
      readonly result: SensorResult<OrientationSample>;
    }
  | { readonly kind: 'frameReset'; readonly timeUtcMs: number; readonly event: FrameResetEvent }
  | {
      readonly kind: 'positionFix';
      readonly timeUtcMs: number;
      readonly result: SensorResult<PositionFix>;
    }
  | {
      readonly kind: 'declination';
      readonly timeUtcMs: number;
      readonly result: SensorResult<Declination>;
    }
  | { readonly kind: 'camera'; readonly timeUtcMs: number; readonly result: UiResult<null> }
  | { readonly kind: 'tick'; readonly timeUtcMs: number };

/** Where `establishYaw` takes the azimuth of the sighted direction from. */
export type YawSource =
  | { readonly kind: 'compass' }
  | {
      readonly kind: 'knownAzimuth';
      readonly azimuthRad: number;
      readonly sigmaRad: number;
      readonly northReference: 'true' | 'magnetic';
    };

export type ActionEvent =
  | { readonly kind: 'freeze'; readonly timeUtcMs: number }
  | { readonly kind: 'unfreeze'; readonly timeUtcMs: number }
  | {
      readonly kind: 'mark';
      readonly timeUtcMs: number;
      readonly point: PixelPoint;
      readonly layout: ImageLayout;
      readonly calibration: CameraCalibration | null;
      readonly tapSigmaPx: number;
    }
  | { readonly kind: 'clearMark'; readonly timeUtcMs: number }
  | { readonly kind: 'capture'; readonly timeUtcMs: number }
  | { readonly kind: 'establishYaw'; readonly timeUtcMs: number; readonly from: YawSource }
  | { readonly kind: 'again'; readonly timeUtcMs: number }
  | { readonly kind: 'restart'; readonly timeUtcMs: number };

export type SessionEvent = DataEvent | ActionEvent;

/** An action event without its time: the driver stamps it with `source.now()` (design §6). */
export type ActionRequest = ActionEvent extends infer E
  ? E extends { readonly timeUtcMs: number }
    ? Omit<E, 'timeUtcMs'>
    : never
  : never;

/** What the Session asks the driver to do (design D3). Permission is not an effect (D4). */
export type SessionEffect =
  { readonly kind: 'startOrientation' } | { readonly kind: 'startPositions' };

const ACTION_KINDS: ReadonlySet<string> = new Set([
  'freeze',
  'unfreeze',
  'mark',
  'clearMark',
  'capture',
  'establishYaw',
  'again',
  'restart',
]);

/** Whether an event is an action event (what the user does) rather than a data event. */
export function isActionEvent(event: SessionEvent): event is ActionEvent {
  return ACTION_KINDS.has(event.kind);
}
