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
//
// Layout (Req 13.13, 13.14; amendments of 2026-11-19). Every part lies in the normal flow and the
// screen is as tall as its content; only the Reticle and the Mark are placed over the image, which
// clips them. The image has a height of its own (`IMAGE_HEIGHT`). The control bar follows directly
// after the parts it belongs to, and the longer forms come after it. Directly above the bar are, in
// this order, the Yaw status (with its prompt) and the Message of a Notice, so that a refused action
// is shown where the user is looking when the control is pressed. While a bearing Session on the
// Relative frame has no valid north, "Set north from the compass" is the primary control and Freeze
// a secondary one.
//
// Task 30.4 (2026-11-20): on a phone held up at smoke the control must be reachable without
// scrolling, so the bar comes directly after the image and the readout. Above it are only what
// Req 13.14 puts there: the Yaw status while north must be set (the Relative frame without a valid
// north), the portrait warning and the Message of a Notice. The instruction ("Aim the crosshair
// …"), the Yaw status when it asks nothing, the limits line and the known-azimuth form follow
// the bar. The image is 28 % of the small viewport, so that at 844 CSS px of height the readout
// and the bar fit under an app's banner and Back (Vigia's `sight-first-screen.test.tsx`).

import { wrapPi } from '@alidade/core';
import { useState, type ReactNode } from 'react';
import type { CameraCalibration } from '../math/camera-calibration';
import type { ImageFit, ImageLayout, SourceSize } from '../math/image-layout';
import type { SessionParameters } from '../math/session/parameters';
import type { Session } from '../math/session/session';
import type { UiReason } from '../reasons';
import type { ActionRequest } from '../math/session/session-events';
import { yawStatus } from '../math/session/yaw-status';
import { CaptureSummary } from './CaptureSummary';
import { DOCKED_IMAGE_MIN_HEIGHT_PX } from '../defaults';
import { ControlBar, controlStyle, DockedBar, type ControlSpec } from './ControlBar';
import type { ObserveElementSize } from './dom-size';
import { FailureNotice } from './FailureNotice';
import { ImageSurface, type AimGesture } from './ImageSurface';
import { KnownAzimuthForm } from './KnownAzimuthForm';
import { LimitsNote } from './LimitsNote';
import { Readout } from './Readout';
import { BODY_FONT_STACK, COLOURS, SIZES } from './theme';
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
  /**
   * `flow` (the default): every part in the page's normal flow, as tall as its content. `docked`
   * (Req 13.15): a column of `100dvh` with the caller's `top` row, a middle part that alone
   * scrolls, and the bar as its last row. The caller gives the column a parent with no padding.
   */
  readonly layout?: SightingLayout;
  /**
   * Whether a tap on the frozen image is taken (Req 13.17, 18.10 as amended). Default: whether a
   * calibration is given. A caller that holds a calibration and withholds it until the tap's
   * 1-sigma is valid passes `true`, so that the tap is refused with `calibration_missing`.
   */
  readonly tapsEnabled?: boolean;
  /** Docked: a row above the middle part (Vigia: Back). */
  readonly top?: ReactNode;
  /** Docked: the aiming line, at the top of the middle part, in place of the screen's own hint. */
  readonly aim?: ReactNode;
  /** Docked: rows at the end of the middle part. */
  readonly extra?: ReactNode;
}

export type SightingLayout = 'flow' | 'docked';

/**
 * The height of the image: 28 % of the small viewport, and never under 200 or over 480 CSS px,
 * so that the readout and the controls follow it inside a phone's first screen (task 30.4). A height of its own, not a share of
 * the screen's, so that the screen grows with its content and nothing spills out of it.
 */
export const IMAGE_HEIGHT = 'clamp(200px, 28svh, 480px)';

export const SCREEN_TEXT = {
  permission:
    'Hold the phone upright in portrait, tap Start, then aim the crosshair at the target.',
  starting: 'Starting the motion sensors.',
  liveHint: 'Aim the crosshair at the target, then tap Freeze.',
  frozenHint: 'Tap the image to mark the target, or capture on the crosshair.',
  /** Where no tap can mark (no Camera calibration, Req 13.17). */
  frozenHintNoMark: 'Capture takes the direction of the crosshair.',
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

/** The Message that the Yaw status's prompt shows, to show a Notice of the same reason once. */
function promptReason(status: string, frame: string | null): UiReason | null {
  if (status === 'none') return frame === 'absolute' ? null : 'no_yaw_reference';
  if (status === 'stale') return 'stale_yaw_reference';
  if (status === 'invalidated') return 'frame_reset';
  return null;
}

export function SightingScreen(props: SightingScreenProps) {
  const { session, parameters, onAction } = props;
  const docked = props.layout === 'docked';
  const [otherWays, setOtherWays] = useState(false);
  const state = session.state;
  const bearing = session.kind === 'bearing';
  const frozen = state === 'frozen';
  const showImage = state === 'starting' || state === 'live' || frozen;
  const mark = session.frozen?.mark ?? null;
  const marking = props.tapsEnabled ?? props.calibration !== null;
  const status = yawStatus(
    session.yawReference,
    session.history.frameResets,
    session.nowUtcMs ?? 0,
    parameters.yawReferenceMaxAgeMs,
  );
  const frame = newestFrame(session);
  // Req 13.14: with no valid north on the Relative frame, a bearing cannot be captured; setting
  // north is what the user must do first.
  const northFirst = bearing && frame === 'relative' && status.status !== 'valid';

  const controls: ControlSpec[] = [];
  if (state === 'permission') {
    controls.push({
      id: 'start',
      label: 'Start',
      primary: true,
      onPress: props.onRequestPermission,
    });
  } else if (state === 'live') {
    const freeze: ControlSpec = {
      id: 'freeze',
      label: 'Freeze',
      primary: !northFirst,
      onPress: () => onAction({ kind: 'freeze' }),
    };
    const north: ControlSpec = {
      id: 'north-compass',
      label: 'Set north from the compass',
      primary: northFirst,
      onPress: () => onAction({ kind: 'establishYaw', from: { kind: 'compass' } }),
    };
    // Docked: the current action only (Req 13.15); the compass is also in "Other ways".
    if (docked) controls.push(northFirst ? { ...north, primary: true } : freeze);
    else if (!bearing) controls.push(freeze);
    else if (northFirst) controls.push(north, freeze);
    else controls.push(freeze, north);
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

  const portrait =
    (state === 'live' || frozen) &&
    portraitProblem(session, parameters) &&
    session.notice?.reason !== 'portrait_required';

  const text = {
    fontFamily: BODY_FONT_STACK,
    fontSize: SIZES.labelPx,
    lineHeight: 1.25,
    color: COLOURS.ink,
    margin: 0,
    padding: SIZES.gapPx,
  } as const;

  const yawBar = (lineOnly = false) => (
    <YawStatusBar
      status={status}
      yawReference={session.yawReference}
      frame={frame}
      headingSigmaRad={parameters.headingSigmaRad}
      lineOnly={lineOnly}
    />
  );

  const imageBox = (
    <div
      data-part="image-box"
      style={
        docked
          ? { position: 'relative', flex: '1 1 auto', minHeight: DOCKED_IMAGE_MIN_HEIGHT_PX }
          : { position: 'relative', height: IMAGE_HEIGHT }
      }
    >
      <ImageSurface
        frozen={frozen}
        sourceSize={props.sourceSize}
        fit={props.fit}
        mark={mark}
        observe={props.observe}
        onLayout={props.onLayout}
        onAim={props.onAim}
        label={props.imageLabel}
        onMark={(point, layout) => {
          // No calibration, no tap: the image takes no taps (Req 18.10 as amended, 13.17).
          if (!marking) return;
          onAction({
            kind: 'mark',
            point,
            layout,
            calibration: props.calibration,
            tapSigmaPx: props.tapSigmaPx,
          });
        }}
      >
        {(layout) => props.renderImage(layout, frozen)}
      </ImageSurface>
    </div>
  );

  const frozenHint = (
    <p data-part="hint" style={text}>
      {marking
        ? `${SCREEN_TEXT.frozenHint} ${mark === null ? SCREEN_TEXT.notMarked : SCREEN_TEXT.marked}`
        : SCREEN_TEXT.frozenHintNoMark}
    </p>
  );

  if (docked) {
    const root = {
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      overflow: 'hidden',
      background: COLOURS.bg,
    } as const;
    const middleStyle = {
      flex: '1 1 auto',
      minHeight: 0,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
    } as const;
    const askNorth = bearing && (state === 'live' || frozen);

    if (otherWays && askNorth) {
      const close = () => setOtherWays(false);
      return (
        <div
          data-testid="sighting-screen"
          data-state={state}
          data-layout="docked"
          data-view="other-ways"
          style={root}
        >
          {props.top}
          <div data-part="middle" style={middleStyle}>
            <div
              style={{
                padding: SIZES.gapPx,
                display: 'flex',
                flexDirection: 'column',
                gap: SIZES.gapPx,
              }}
            >
              <button type="button" style={controlStyle(false)} onClick={close}>
                Back to the sighting
              </button>
              {state === 'live' && (
                <button
                  type="button"
                  data-control="north-compass"
                  style={controlStyle(false)}
                  onClick={() => {
                    close();
                    onAction({ kind: 'establishYaw', from: { kind: 'compass' } });
                  }}
                >
                  Set north from the compass
                </button>
              )}
            </div>
            <KnownAzimuthForm
              onSubmit={(from) => {
                close();
                onAction({ kind: 'establishYaw', from });
              }}
            />
          </div>
        </div>
      );
    }

    const needsPrompt =
      bearing &&
      (state === 'live' || frozen) &&
      (northFirst || promptReason(status.status, frame) !== null);
    const shownPromptReason = needsPrompt ? promptReason(status.status, frame) : null;
    const notice =
      state !== 'failed' &&
      session.notice !== null &&
      !(shownPromptReason !== null && session.notice.reason === shownPromptReason)
        ? session.notice
        : null;
    const barText =
      state === 'starting' ? (
        <p data-part="hint" style={{ ...text, padding: 0 }}>
          {SCREEN_TEXT.starting}
        </p>
      ) : (
        <>
          {needsPrompt && yawBar()}
          {portrait && <FailureNotice failure={{ reason: 'portrait_required' }} />}
          {state === 'failed' && session.failure !== null && (
            <FailureNotice failure={session.failure} />
          )}
          {notice !== null && <FailureNotice failure={notice} />}
        </>
      );
    const hasBarText =
      state === 'starting' ||
      needsPrompt ||
      portrait ||
      (state === 'failed' && session.failure !== null) ||
      notice !== null;
    const limits = <LimitsNote />;
    const liveHint = (
      <p data-part="hint" style={text}>
        {SCREEN_TEXT.liveHint}
      </p>
    );
    return (
      <div data-testid="sighting-screen" data-state={state} data-layout="docked" style={root}>
        {props.top}
        <div data-part="middle" style={middleStyle}>
          {props.aim ?? (state === 'live' ? liveHint : null)}
          {state === 'permission' && (
            <p data-part="intro" style={text}>
              {SCREEN_TEXT.permission}
            </p>
          )}
          {state === 'permission' && limits}
          {showImage && imageBox}
          {state === 'live' && (
            <Readout readout={session.readout} compact kind={session.kind}>
              {bearing && !needsPrompt && yawBar(true)}
              {limits}
            </Readout>
          )}
          {frozen && frozenHint}
          {frozen && (
            <details data-part="details" style={{ padding: `0 ${SIZES.gapPx}px` }}>
              <summary
                style={{
                  ...text,
                  padding: 0,
                  minHeight: SIZES.touchPx,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Details
              </summary>
              {bearing && !needsPrompt && yawBar(true)}
              {limits}
            </details>
          )}
          {state === 'captured' && session.captured !== null && (
            <CaptureSummary result={session.captured} compact />
          )}
          {askNorth && (
            <button
              type="button"
              style={{ ...controlStyle(false), margin: SIZES.gapPx }}
              onClick={() => setOtherWays(true)}
            >
              Other ways to set north
            </button>
          )}
          {props.extra}
        </div>
        <DockedBar text={hasBarText ? barText : null} controls={controls} />
      </div>
    );
  }

  return (
    <div
      data-testid="sighting-screen"
      data-state={state}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: COLOURS.bg,
      }}
    >
      {state === 'permission' && (
        <p data-part="intro" style={text}>
          {SCREEN_TEXT.permission}
        </p>
      )}
      {state === 'permission' && <LimitsNote />}
      {state === 'starting' && (
        <p data-part="hint" style={text}>
          {SCREEN_TEXT.starting}
        </p>
      )}
      {showImage && imageBox}
      {state === 'live' && <Readout readout={session.readout} />}
      {portrait && <FailureNotice failure={{ reason: 'portrait_required' }} />}
      {state === 'captured' && session.captured !== null && (
        <CaptureSummary result={session.captured} />
      )}
      {(state === 'live' || frozen) && bearing && northFirst && yawBar()}
      {state === 'failed' && session.failure !== null && (
        <FailureNotice failure={session.failure} />
      )}
      {state !== 'failed' && session.notice !== null && <FailureNotice failure={session.notice} />}
      <ControlBar controls={controls} />
      {state === 'live' && (
        <p data-part="hint" style={text}>
          {SCREEN_TEXT.liveHint}
        </p>
      )}
      {frozen && frozenHint}
      {(state === 'live' || frozen) && bearing && !northFirst && yawBar()}
      {state === 'live' && <LimitsNote />}
      {(state === 'live' || frozen) && bearing && (
        <KnownAzimuthForm onSubmit={(from) => onAction({ kind: 'establishYaw', from })} />
      )}
    </div>
  );
}
