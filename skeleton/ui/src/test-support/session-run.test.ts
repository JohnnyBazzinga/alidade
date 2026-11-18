import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SessionStateKind } from '../math/session/session';
import { runSession, sessionRunCase } from './session-run';

/** The share of runs that reach each state, over `n` runs with a fixed seed. */
export function stateCoverage(n: number, seed: number): Record<SessionStateKind, number> {
  const counts: Record<SessionStateKind, number> = {
    permission: 0,
    starting: 0,
    live: 0,
    frozen: 0,
    captured: 0,
    failed: 0,
  };
  for (const c of fc.sample(sessionRunCase(), { numRuns: n, seed })) {
    const reached = new Set(runSession(c).sessions.map((s) => s.state));
    for (const state of reached) counts[state] += 1;
  }
  for (const state of Object.keys(counts) as SessionStateKind[]) counts[state] /= n;
  return counts;
}

describe('sessionRun (design §8, task 12.1)', () => {
  it('reaches every state, and frozen, captured and failed in at least 10 % of runs each', () => {
    const coverage = stateCoverage(200, 2026);
    console.log(`[coverage] sessionRun ${JSON.stringify(coverage)}`);
    for (const state of ['frozen', 'captured', 'failed'] as const) {
      expect(coverage[state], state).toBeGreaterThanOrEqual(0.1);
    }
    for (const state of ['starting', 'live'] as const) expect(coverage[state]).toBeGreaterThan(0);
  });

  it('draws steps that go back about one time in ten, and hostile events', () => {
    const cases = fc.sample(sessionRunCase(), { numRuns: 100, seed: 3 });
    const steps = cases.flatMap((c) => c.stepsMs);
    const back = steps.filter((s) => s < 0).length / steps.length;
    expect(back).toBeGreaterThan(0.05);
    expect(back).toBeLessThan(0.15);
    const intents = cases.flatMap((c) => c.intents);
    expect(intents.filter((i) => i.kind === 'hostile').length / intents.length).toBeGreaterThan(
      0.03,
    );
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(['bearing', 'altitude']));
  });
});
