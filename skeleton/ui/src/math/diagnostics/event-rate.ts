// The orientation event rate for the Playground's diagnostics (Req 18.6, Sensors Device check 2).

/**
 * Events per second over the window `(endUtcMs - windowMs, endUtcMs]`: the count of timestamps in
 * it divided by the window in seconds. 0 for an empty list or a window that is not a finite
 * positive duration; timestamps after `endUtcMs` (a clock that stepped back) are not counted.
 */
export function eventRateHz(
  timestampsUtcMs: readonly number[],
  endUtcMs: number,
  windowMs: number,
): number {
  if (!Number.isFinite(endUtcMs) || !Number.isFinite(windowMs) || !(windowMs > 0)) return 0;
  let count = 0;
  for (const t of timestampsUtcMs) if (t > endUtcMs - windowMs && t <= endUtcMs) count += 1;
  const rate = count / (windowMs / 1000);
  return Number.isFinite(rate) ? rate : 0;
}
