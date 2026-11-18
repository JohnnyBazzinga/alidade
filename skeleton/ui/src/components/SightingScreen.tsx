// The sighting screen (Req 8, 9, 10, 11.4, 13): what is shown and offered in each Session state.
//
//   permission  intro text, the limits line, Start.
//   starting    the image with the Reticle, "Starting the motion sensors."
//   live        the image with the Reticle, the Live readout, the Yaw status (bearing), a hint,
//               Freeze, and for a bearing "Set north from the compass" and the known-azimuth form.
//   frozen      the frozen image with the Reticle and the Mark, the Yaw status (bearing), a hint,
//               Capture, Back to live, Clear mark (with a Mark), and the known-azimuth form.
//   captured    the result with its 1-sigma, what it is made of and the limits line; Take another.
//   failed      the failure's Message; Start again.
//
// A Notice is shown in every state but `failed`; `portrait_required` is shown in `live` and
// `frozen` while the newest sample's Screen angle is not 0.

import { wrapPi } from '@alidade/core';
import type { ReactNode } from 'react';
import type { CameraCalibration } from '../math/camera-calibration';
import type { ImageFit, ImageLayout, SourceSize } from '../math/image-layout';
import type { SessionParameters } from '../math/session/parameters';
import type { Session } from '../math/session/session';
import type { ActionRequest } from '../math/session/session-events';
import { yawStatus } from '../math/session/yaw-status';
import { CaptureSummary } from './CaptureSummary';
import { ControlBar, type ControlSpec } from './ControlBar';
import type { ObserveElementSize } from './dom-size';
import { FailureNotice } from './FailureNotice';
import { ImageSurface, type AimGesture } from './ImageSurface';
import { KnownAzimuthForm } from './KnownAzimuthForm';
import { LimitsNote } from './LimitsNote';
import { Readout } from './Readout';
import { COLOURS, FONT_STACK, SIZES } from './theme';
import { YawStatusBar } from './YawStatusBar';

export interface SightingScreenProps {
  readonly session: Session;
  readonly parameters: SessionParameters;
  /** Called from the Start tap. */
  readonly onRequestPermission: () => void;
  readonly onAction: (action: ActionRequest) => void;
  readonly sourceSize: SourceSize | null;
  readonly fit: ImageFit;
  /** `null` until the user has one: a Mark then fails with `calibration_missing`. */
  readonly calibration: CameraCalibration | null;
  /** The 1-sigma of a tap in CSS pixels; `NaN` while the user has not given one. */
  readonly tapSigmaPx: number;
  readonly renderImage: (layout: ImageLayout | null, frozen: boolean) => ReactNode;
  readonly onAim?: (gesture: AimGesture) => void;
  readonly onLayout?: (layout: ImageLayout | null) => void;
  readonly observe?: ObserveElementSize;
  readonly imageLabel?: string;
}

export const SCREEN_TEXT = {
  permission:
    'Hold the phone upright in portrait, tap Start, then aim the crosshair at the target.',
  starting: 'Starting the motion sensors.',
  liveHint: 'Aim the crosshair at the target, then tap Freeze.',
  frozenHint: 'Tap the image to mark the target, or capture on the crosshair.',
  marked: 'Mark set: the capture will use the point you tapped.',
  notMarked: 'No mark: the capture will use the crosshair.',
} as const;

/** The frame of the newest sample, or `null` before the first (Req 11.4). */
function newestFrame(session: Session): 'absolute' | 'relative' | null {
  let newest = null;
  for (const s of session.history.samples) {
    if (newest === null || s.timeUtcMs >= newest.timeUtcMs) newest = s;
  }
  return newest === null ? null : newest.frame;
}

/** Whether the newest sample's Screen angle is 0 (Req 13.9); `null` and any other angle are not. */
function portraitProblem(session: Session, parameters: SessionParameters): boolean {
  let newest = null;
  for (const s of session.history.samples) {
    if (newest === null || s.timeUtcMs >= newest.timeUtcMs) newest = s;
  }
  if (newest === null) return false;
  if (newest.screenAngleRad === null) return true;
  const wrapped = wrapPi(newest.screenAngleRad);
  return !wrapped.ok || Math.abs(wrapped.value) > parameters.screenAngleToleranceRad;
}

export function SightingScreen(props: SightingScreenProps) {
  const { session, parameters, onAction } = props;
  const state = session.state;
  const bearing = session.kind === 'bearing';
  const frozen = state === 'frozen';
  const showImage = state === 'starting' || state === 'live' || frozen;
  const mark = session.frozen?.mark ?? null;

  const controls: ControlSpec[] = [];
  if (state === 'permission') {
    controls.push({
      id: 'start',
      label: 'Start',
      primary: true,
      onPress: props.onRequestPermission,
    });
  } else if (state === 'live') {
    controls.push({
      id: 'freeze',
      label: 'Freeze',
      primary: true,
      onPress: () => onAction({ kind: 'freeze' }),
    });
    if (bearing) {
      controls.push({
        id: 'north-compass',
        label: 'Set north from the compass',
        onPress: () => onAction({ kind: 'establishYaw', from: { kind: 'compass' } }),
      });
    }
  } else if (frozen) {
    controls.push({
      id: 'capture',
      label: 'Capture',
      primary: true,
      onPress: () => onAction({ kind: 'capture' }),
    });
    controls.push({
      id: 'unfreeze',
      label: 'Back to live',
      onPress: () => onAction({ kind: 'unfreeze' }),
    });
    if (mark !== null) {
      controls.push({
        id: 'clear-mark',
        label: 'Clear mark',
        onPress: () => onAction({ kind: 'clearMark' }),
      });
    }
  } else if (state === 'captured') {
    controls.push({
      id: 'again',
      label: 'Take another',
      onPress: () => onAction({ kind: 'again' }),
    });
  } else if (state === 'failed') {
    controls.push({
      id: 'restart',
      label: 'Start again',
      onPress: () => onAction({ kind: 'restart' }),
    });
  }

  const status = yawStatus(
    session.yawReference,
    session.history.frameResets,
    session.nowUtcMs ?? 0,
    parameters.yawReferenceMaxAgeMs,
  );
  const portrait =
    (state === 'live' || frozen) &&
    portraitProblem(session, parameters) &&
    session.notice?.reason !== 'portrait_required';

  const text = {
    fontFamily: FONT_STACK,
    fontSize: SIZES.labelPx,
    color: COLOURS.ink,
    margin: 0,
    padding: SIZES.gapPx,
  } as const;

  return (
    <div
      data-testid="sighting-screen"
      data-state={state}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        background: COLOURS.bg,
      }}
    >
      {state === 'permission' && (
        <p data-part="intro" style={text}>
          {SCREEN_TEXT.permission}
        </p>
      )}
      {state === 'starting' && (
        <p data-part="hint" style={text}>
          {SCREEN_TEXT.starting}
        </p>
      )}
      {showImage && (
        <div style={{ position: 'relative', flex: '1 1 320px', minHeight: 320 }}>
          <ImageSurface
            frozen={frozen}
            sourceSize={props.sourceSize}
            fit={props.fit}
            mark={mark}
            observe={props.observe}
            onLayout={props.onLayout}
            onAim={props.onAim}
            label={props.imageLabel}
            onMark={(point, layout) =>
              onAction({
                kind: 'mark',
                point,
                layout,
                calibration: props.calibration,
                tapSigmaPx: props.tapSigmaPx,
              })
            }
          >
            {(layout) => props.renderImage(layout, frozen)}
          </ImageSurface>
        </div>
      )}
      {state === 'live' && <Readout readout={session.readout} />}
      {(state === 'live' || frozen) && bearing && (
        <YawStatusBar
          status={status}
          yawReference={session.yawReference}
          frame={newestFrame(session)}
          headingSigmaRad={parameters.headingSigmaRad}
        />
      )}
      {state === 'live' && (
        <p data-part="hint" style={text}>
          {SCREEN_TEXT.liveHint}
        </p>
      )}
      {frozen && (
        <p data-part="hint" style={text}>
          {SCREEN_TEXT.frozenHint} {mark === null ? SCREEN_TEXT.notMarked : SCREEN_TEXT.marked}
        </p>
      )}
      {portrait && <FailureNotice failure={{ reason: 'portrait_required' }} />}
      {state === 'captured' && session.captured !== null && (
        <CaptureSummary result={session.captured} />
      )}
      {state === 'failed' && session.failure !== null && (
        <FailureNotice failure={session.failure} />
      )}
      {state !== 'failed' && session.notice !== null && <FailureNotice failure={session.notice} />}
      {(state === 'permission' || state === 'live') && <LimitsNote />}
      {(state === 'live' || frozen) && bearing && (
        <KnownAzimuthForm onSubmit={(from) => onAction({ kind: 'establishYaw', from })} />
      )}
      <ControlBar controls={controls} />
    </div>
  );
}
