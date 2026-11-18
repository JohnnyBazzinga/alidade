// The Sensor source interface (Req 4, 7, 11, 12; design §6): what the rest of the skeleton sees of
// the sensors, whether they are a browser's or the Simulator's.

import type { FrameResetEvent } from './frame-reset';
import type { OrientationFrame, OrientationSample } from './orientation-sample';
import { checkDurationMs, checkScale } from './parameters';
import type { PositionFix } from './position-fix';
import { err, ok, type SensorResult } from './sensor-result';
import type { Unsubscribe } from './listener-set';

export type { Unsubscribe } from './listener-set';

export interface SensorSourceOptions {
  /** How long a start waits for the first orientation sample (Req 11.5). */
  readonly listeningTimeoutMs: number;
  /** How long a start waits for a position, measured by the source itself (Req 7.6). */
  readonly positionTimeoutMs: number;
  /** The reported accuracy is divided by this to give the 1-sigma (Req 7.3). */
  readonly positionConfidenceScale: number;
  /** Receives every value a listener throws (Req 11.11, D22); a value it throws is dropped. */
  readonly onListenerError?: (error: unknown) => void;
}

export interface SensorSource {
  /** The Clock that stamps this source's data, milliseconds since the epoch, UTC. */
  now(): number;
  /**
   * Requests the orientation permission. The user interface calls this from a user gesture; the
   * source never requests it on its own (Req 11.2).
   */
  requestOrientationPermission(): Promise<SensorResult<'granted' | 'not_required'>>;
  /** Starts orientation; settles with the frame of the first valid sample, or a failure. */
  startOrientation(): Promise<SensorResult<OrientationFrame>>;
  /** Starts positions; settles with the first fix, or a failure (Req 7.1). */
  startPosition(): Promise<SensorResult<PositionFix>>;
  /** Stops both, removing every listener, watch and timer (Req 11.9). */
  stop(): void;
  onOrientation(listener: (sample: SensorResult<OrientationSample>) => void): Unsubscribe;
  onFrameReset(listener: (event: FrameResetEvent) => void): Unsubscribe;
  onPosition(listener: (fix: SensorResult<PositionFix>) => void): Unsubscribe;
}

/** Validates the options (Req 10.3), naming the offending field. */
export function checkSourceOptions(
  options: SensorSourceOptions,
): SensorResult<SensorSourceOptions> {
  const checks = [
    checkDurationMs(options.listeningTimeoutMs, 'listeningTimeoutMs'),
    checkDurationMs(options.positionTimeoutMs, 'positionTimeoutMs'),
    checkScale(options.positionConfidenceScale, 'positionConfidenceScale'),
  ];
  for (const check of checks) if (!check.ok) return check;
  if (options.onListenerError !== undefined && typeof options.onListenerError !== 'function') {
    return err('invalid_number', { field: 'onListenerError' });
  }
  return ok(options);
}
