// The Sample history (Req 14, design §7.13, D23): the recent Orientation samples, the recent Frame
// resets and the latest Position fix of one Sensor source, as plain immutable data.
//
// Every add returns a new history and leaves the old one untouched, so a caller can keep the
// history of the moment an image was frozen and capture from it later (Req 14.1). Both captures
// and both Yaw reference constructors take `history.samples` and `history.frameResets` as they are
// (Req 14.5).

import type { FrameResetEvent } from './frame-reset';
import { checkSampleValid, type OrientationSample } from './orientation-sample';
import { checkDurationMs } from './parameters';
import { checkFixValid, type PositionFix } from './position-fix';
import { err, ok, type SensorResult } from './sensor-result';

export interface SampleHistory {
  /** The samples within the sample retention of `newestUtcMs`, in the order added. */
  readonly samples: readonly OrientationSample[];
  /** The resets within the Frame reset retention of `newestUtcMs`, in the order added. */
  readonly frameResets: readonly FrameResetEvent[];
  /** The most recently added fix, or `null`. */
  readonly positionFix: PositionFix | null;
  /** The largest `timeUtcMs` of every item received, fixes included; `null` until the first. */
  readonly newestUtcMs: number | null;
  readonly sampleRetentionMs: number;
  /**
   * Must be at least the Yaw reference maximum age plus the Sighting window length, so that every
   * Frame reset that could invalidate a usable Yaw reference is still held (Req 14.3).
   */
  readonly frameResetRetentionMs: number;
}

export interface SampleHistoryRetention {
  /** Default `SAMPLE_RETENTION_MS`. */
  readonly sampleRetentionMs: number;
  /** Default `FRAME_RESET_RETENTION_MS`; see `SampleHistory.frameResetRetentionMs`. */
  readonly frameResetRetentionMs: number;
}

function freeze(history: SampleHistory): SampleHistory {
  Object.freeze(history.samples);
  Object.freeze(history.frameResets);
  return Object.freeze(history);
}

/** An empty history (Req 14.3). Fails with `invalid_number` naming a bad retention. */
export function createSampleHistory(
  retention: SampleHistoryRetention,
): SensorResult<SampleHistory> {
  const samples = checkDurationMs(retention.sampleRetentionMs, 'sampleRetentionMs');
  if (!samples.ok) return samples;
  const resets = checkDurationMs(retention.frameResetRetentionMs, 'frameResetRetentionMs');
  if (!resets.ok) return resets;
  return ok(
    freeze({
      samples: [],
      frameResets: [],
      positionFix: null,
      newestUtcMs: null,
      sampleRetentionMs: retention.sampleRetentionMs,
      frameResetRetentionMs: retention.frameResetRetentionMs,
    }),
  );
}

type Item =
  | { readonly kind: 'sample'; readonly value: OrientationSample }
  | { readonly kind: 'reset'; readonly value: FrameResetEvent }
  | { readonly kind: 'fix'; readonly value: PositionFix };

/**
 * The new history after one item (§7.13): the newest time becomes the larger of the old one and
 * the item's; the samples and resets kept are those no more than their retention before it, in the
 * order added (Req 14.2). An item older than the newest (the clock stepped back) is accepted and
 * kept if it is within its retention (Req 14.4).
 *
 * The whole item is validated first, time first, and an invalid one is refused with the history
 * unchanged, so a history never holds a NaN or an infinity (Req 14.4, 11.8; D23). A sample is
 * checked with `checkSampleValid` and a fix with `checkFixValid`, the rules `checkPositionFix`
 * applies; the history does not judge whether a fix is Stale or a Coarse location.
 */
function add(history: SampleHistory, item: Item): SensorResult<SampleHistory> {
  const timeUtcMs = item.value.timeUtcMs;
  if (!Number.isFinite(timeUtcMs)) return err('invalid_number', { field: 'timeUtcMs' });
  if (item.kind === 'sample') {
    const valid = checkSampleValid(item.value);
    if (!valid.ok) return valid;
  } else if (item.kind === 'fix') {
    const valid = checkFixValid(item.value);
    if (!valid.ok) return valid;
  }
  const newestUtcMs =
    history.newestUtcMs === null ? timeUtcMs : Math.max(history.newestUtcMs, timeUtcMs);
  const keepSample = (s: OrientationSample) =>
    newestUtcMs - s.timeUtcMs <= history.sampleRetentionMs;
  const keepReset = (r: FrameResetEvent) =>
    newestUtcMs - r.timeUtcMs <= history.frameResetRetentionMs;
  const samples = history.samples.filter(keepSample);
  const frameResets = history.frameResets.filter(keepReset);
  if (item.kind === 'sample' && keepSample(item.value)) samples.push(item.value);
  if (item.kind === 'reset' && keepReset(item.value)) frameResets.push(item.value);
  return ok(
    freeze({
      samples,
      frameResets,
      positionFix: item.kind === 'fix' ? item.value : history.positionFix,
      newestUtcMs,
      sampleRetentionMs: history.sampleRetentionMs,
      frameResetRetentionMs: history.frameResetRetentionMs,
    }),
  );
}

/** Adds an Orientation sample (Req 14.2). */
export function addOrientationSample(
  history: SampleHistory,
  sample: OrientationSample,
): SensorResult<SampleHistory> {
  return add(history, { kind: 'sample', value: sample });
}

/** Adds a Frame reset event (Req 14.2). */
export function addFrameReset(
  history: SampleHistory,
  event: FrameResetEvent,
): SensorResult<SampleHistory> {
  return add(history, { kind: 'reset', value: event });
}

/** Adds a Position fix; it replaces the one held and advances the newest time (Req 14.2, D23). */
export function addPositionFix(
  history: SampleHistory,
  fix: PositionFix,
): SensorResult<SampleHistory> {
  return add(history, { kind: 'fix', value: fix });
}
