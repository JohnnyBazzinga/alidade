// Frame reset events (Req 4.7, 4.8) and which Yaw references they invalidate (Req 5.17, D9).

import type { OrientationFrame } from './orientation-sample';

/**
 * Why a Frame reset was emitted: the page was hidden, the window lost focus, the page was hidden
 * for navigation, the source was started again after a stop (Req 4.7), or a sample arrived in a
 * different frame from the previous one (Req 4.8).
 */
export type FrameResetCause = 'hidden' | 'blur' | 'pagehide' | 'restart' | 'frame_change';

export interface FrameResetEvent {
  readonly timeUtcMs: number;
  readonly cause: FrameResetCause;
}

/**
 * Whether a reset of `cause` invalidates a Yaw reference established in `frame` (Req 5.17).
 * Every cause invalidates a Relative-frame reference, whose zero can move with the page's state.
 * Only `frame_change` invalidates an Absolute-frame one: the Absolute frame's zero is magnetic
 * north, whatever the page does.
 */
export function invalidates(frame: OrientationFrame, cause: FrameResetCause): boolean {
  return frame === 'relative' || cause === 'frame_change';
}
