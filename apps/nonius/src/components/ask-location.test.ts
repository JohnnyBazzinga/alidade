// The one module that asks the phone's location (Req 1.4, 11.2, 15.2; design D17): one
// `startPosition` per call, `stop()` after a fix and after a failure, and the Coarse location limit.

import type { PositionFix, SensorResult, SensorSource } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { askLocationOnce } from './ask-location';

const NOW = 1_800_000_000_000;
const fix = (accuracyM: number, timeUtcMs = NOW): PositionFix => ({
  position: { latRad: 0.5, lonRad: -0.7 },
  reportedAccuracyM: accuracyM,
  sigmaM: accuracyM / 2,
  timeUtcMs,
});
const LIMITS = { clock: () => NOW, positionStalenessMs: 60_000, coarseLocationLimitM: 10_000 };

function recording(result: SensorResult<PositionFix> | 'throw') {
  const log = { created: 0, startPosition: 0, stops: 0, order: [] as string[] };
  const createSource = (): SensorResult<SensorSource> => {
    log.created += 1;
    const source = {
      startPosition: () => {
        log.startPosition += 1;
        log.order.push('start');
        if (result === 'throw') return Promise.reject(new Error('boom'));
        return Promise.resolve(result);
      },
      stop: () => {
        log.stops += 1;
        log.order.push('stop');
      },
    } as unknown as SensorSource;
    return { ok: true, value: source };
  };
  return { log, createSource };
}

describe('askLocationOnce', () => {
  it('asks once, stops the source after the fix, and returns the fix', async () => {
    const { log, createSource } = recording({ ok: true, value: fix(50) });
    const r = await askLocationOnce(createSource, LIMITS);
    expect(r).toEqual({ ok: true, value: fix(50) });
    expect(log).toMatchObject({ created: 1, startPosition: 1, stops: 1 });
    expect(log.order).toEqual(['start', 'stop']);
  });

  it('refuses a fix beyond the Coarse location limit, with its accuracy, and stops the source', async () => {
    const { log, createSource } = recording({ ok: true, value: fix(10_001) });
    const r = await askLocationOnce(createSource, LIMITS);
    expect(r).toMatchObject({ ok: false, reason: 'coarse_location', reportedAccuracyM: 10_001 });
    expect(log.stops).toBe(1);
  });

  it('accepts a fix exactly at the limit', async () => {
    const { createSource } = recording({ ok: true, value: fix(10_000) });
    expect((await askLocationOnce(createSource, LIMITS)).ok).toBe(true);
  });

  it('returns a failure of the source and stops it', async () => {
    const { log, createSource } = recording({ ok: false, reason: 'permission_denied' });
    const r = await askLocationOnce(createSource, LIMITS);
    expect(r).toMatchObject({ ok: false, reason: 'permission_denied' });
    expect(log).toMatchObject({ startPosition: 1, stops: 1 });
  });

  it('turns a rejection into a failure, and stops the source', async () => {
    const { log, createSource } = recording('throw');
    const r = await askLocationOnce(createSource, LIMITS);
    expect(r.ok).toBe(false);
    expect(log.stops).toBe(1);
  });

  it('returns the failure of a source that cannot be made, asking nothing', async () => {
    const r = await askLocationOnce(() => ({ ok: false, reason: 'sensor_unavailable' }), LIMITS);
    expect(r).toMatchObject({ ok: false, reason: 'sensor_unavailable' });
  });

  it('refuses limits that are not finite without making a source', async () => {
    const { log, createSource } = recording({ ok: true, value: fix(5) });
    const r = await askLocationOnce(createSource, { ...LIMITS, coarseLocationLimitM: Number.NaN });
    expect(r.ok).toBe(false);
    expect(log.created).toBe(0);
  });

  it('makes a new source and asks again on each call', async () => {
    const { log, createSource } = recording({ ok: true, value: fix(5) });
    await askLocationOnce(createSource, LIMITS);
    await askLocationOnce(createSource, LIMITS);
    expect(log).toMatchObject({ created: 2, startPosition: 2, stops: 2 });
  });
});
