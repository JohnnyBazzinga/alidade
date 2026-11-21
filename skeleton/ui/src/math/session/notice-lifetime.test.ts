// What Req 8.4, 8.5 and 8.7 do together (UI Open question 14, 2026-11-21). This test DESCRIBES
// today's behaviour and does not call it right or wrong: a failed Orientation sample in `live`
// becomes a Notice, and good samples and ticks neither set nor clear it, so it outlives the
// readings that follow it until an action succeeds. It is not a change to Req 8.7.

import { describe, expect, it } from 'vitest';
import { liveSession, PARAMETERS, run } from '../../test-support/session-fixtures';

describe('a failure Notice and the samples that follow it (Req 8.7, Open question 14)', () => {
  it('stays through later ticks and is cleared by a successful freeze', () => {
    const { session, endUtcMs, built } = liveSession('bearing');
    expect(session.state).toBe('live');
    expect(session.notice).toBeNull();

    const failed = run(session, [
      {
        kind: 'sample',
        timeUtcMs: endUtcMs,
        result: { ok: false, reason: 'sensor_unavailable' },
      },
    ]);
    expect(failed.session.notice?.reason).toBe('sensor_unavailable');

    // Good readings keep arriving (the history's own samples, replayed later) and ticks run.
    const later = Array.from({ length: 20 }, (_, i) => ({
      kind: 'tick' as const,
      timeUtcMs: endUtcMs + (i + 1) * PARAMETERS.readoutIntervalMs,
    }));
    const ticked = run(failed.session, later);
    expect(ticked.session.state).toBe('live');
    expect(ticked.session.notice?.reason).toBe('sensor_unavailable');
    expect(built.endUtcMs).toBe(endUtcMs);
  });

  it('a successful action clears it', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const failed = run(session, [
      { kind: 'sample', timeUtcMs: endUtcMs, result: { ok: false, reason: 'sensor_unavailable' } },
    ]);
    const frozen = run(failed.session, [{ kind: 'freeze', timeUtcMs: endUtcMs }]);
    expect(frozen.session.state).toBe('frozen');
    expect(frozen.session.notice).toBeNull();
  });
});
