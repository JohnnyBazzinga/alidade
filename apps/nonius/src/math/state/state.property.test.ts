import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sightOf } from '../../test-support/captures';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { applyAction, emptyState, type NoniusState } from './apply-action';
import { parseStoredState, serialiseState } from './storage-format';

const params = defaultParameters();

type Step =
  | { kind: 'capture'; n: number }
  | { kind: 'delete'; n: number }
  | { kind: 'start_again' }
  | { kind: 'save'; n: number }
  | { kind: 'remove' }
  | { kind: 'reload' };

describe('P-12.7: the reducer and the storage over action sequences (Req 12.7)', () => {
  // Generator: 0 to 200 actions, each uniformly one of capture (ids drawn from 0..39, so repeats
  // occur), delete one (ids 0..39), start again, save an Index error (value uniform over six
  // fixed values), remove it, reload (serialise then parse). The model is a list and a variable.
  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ kind: fc.constant('capture' as const), n: fc.integer({ min: 0, max: 39 }) }),
    fc.record({ kind: fc.constant('delete' as const), n: fc.integer({ min: 0, max: 39 }) }),
    fc.constant({ kind: 'start_again' as const }),
    fc.record({ kind: fc.constant('save' as const), n: fc.integer({ min: 0, max: 5 }) }),
    fc.constant({ kind: 'remove' as const }),
    fc.constant({ kind: 'reload' as const }),
  );
  it('holds exactly the Sights captured and not deleted, never over MAX_SIGHTS, unique ids, the last Index error saved, and a reload gives an equal state', () => {
    checkProperty(
      'P-12.7',
      fc.property(fc.array(step, { maxLength: 200 }), (steps) => {
        let state: NoniusState = emptyState();
        let ids: string[] = [];
        let ie: number | null = null;
        for (const s of steps) {
          if (s.kind === 'capture') {
            const id = `s${s.n}`;
            const r = applyAction(
              state,
              { kind: 'capture', sight: sightOf({ id, timeUtcMs: Date.UTC(2026, 11, 21, 12) }) },
              params,
            );
            state = r.state;
            if (!ids.includes(id) && ids.length < params.maxSights) ids = [...ids, id];
          } else if (s.kind === 'delete') {
            state = applyAction(state, { kind: 'delete', id: `s${s.n}` }, params).state;
            ids = ids.filter((x) => x !== `s${s.n}`);
          } else if (s.kind === 'start_again') {
            state = applyAction(state, { kind: 'start_again' }, params).state;
            ids = [];
          } else if (s.kind === 'save') {
            const valueRad = (s.n - 2.5) * DEG_TO_RAD;
            state = applyAction(
              state,
              {
                kind: 'save_index_error',
                indexError: {
                  valueRad,
                  sigmaRad: 0.1,
                  sightCount: 1,
                  measuredUtcMs: 1e12,
                  simulated: false,
                },
              },
              params,
            ).state;
            ie = valueRad;
          } else if (s.kind === 'remove') {
            state = applyAction(state, { kind: 'remove_index_error' }, params).state;
            ie = null;
          } else {
            const parsed = parseStoredState(serialiseState(state), params);
            if (!parsed.ok) throw new Error(parsed.reason);
            const before = state;
            if (parsed.value.kind === 'loaded') {
              state = applyAction(
                state,
                { kind: 'reload', state: parsed.value.state },
                params,
              ).state;
            } else {
              expect(parsed.value.kind).toBe('empty');
              state = applyAction(state, { kind: 'reload', state: emptyState() }, params).state;
            }
            expect(state).toEqual(before);
          }
          expect(state.sights.map((x) => x.id)).toEqual(ids);
          expect(state.sights.length).toBeLessThanOrEqual(params.maxSights);
          expect(new Set(state.sights.map((x) => x.id)).size).toBe(state.sights.length);
          expect(state.indexError?.valueRad ?? null).toBe(ie);
          expect(JSON.stringify(state)).not.toContain('latRad');
        }
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(400) },
    );
  });
});
