// The reducer over the Sights and the Index error (Req 12.1 to 12.5, 15.5; design D18).

import { describe, expect, it } from 'vitest';
import { sightOf } from '../../test-support/captures';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import { applyAction, emptyState, type NoniusState } from './apply-action';

const params = defaultParameters();
const IE: IndexError = {
  valueRad: -3.3 * DEG_TO_RAD,
  sigmaRad: 0.2 * DEG_TO_RAD,
  sightCount: 3,
  measuredUtcMs: 1_000,
  simulated: false,
};

function apply(state: NoniusState, action: Parameters<typeof applyAction>[1]) {
  return applyAction(state, action, params);
}

describe('applyAction', () => {
  it('captures a Sight and says that saved data changed', () => {
    const r = apply(emptyState(), { kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(r.state.sights.map((s) => s.id)).toEqual(['a']);
    expect(r.failure).toBeNull();
    expect(r.saves).toBe(true);
  });

  it('refuses a Sight with an id already held, leaving the state as it was', () => {
    const one = apply(emptyState(), { kind: 'capture', sight: sightOf({ id: 'a' }) }).state;
    const r = apply(one, { kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(r.state).toBe(one);
    expect(r.failure?.reason).toBe('invalid_observation');
    expect(r.saves).toBe(false);
  });

  it('refuses a capture beyond MAX_SIGHTS with sights_full', () => {
    let s = emptyState();
    for (let i = 0; i < params.maxSights; i += 1) {
      s = apply(s, { kind: 'capture', sight: sightOf({ id: `s${i}` }) }).state;
    }
    const r = apply(s, { kind: 'capture', sight: sightOf({ id: 'extra' }) });
    expect(r.failure?.reason).toBe('sights_full');
    expect(r.state.sights).toHaveLength(params.maxSights);
  });

  it('refuses a Sight with a number that is not finite', () => {
    const r = apply(emptyState(), {
      kind: 'capture',
      sight: sightOf({ rawApparentAltitudeRad: Number.NaN }),
    });
    expect(r.failure).toMatchObject({
      reason: 'invalid_observation',
      field: 'rawApparentAltitudeRad',
    });
    expect(r.state.sights).toHaveLength(0);
  });

  it('deletes one Sight, and an unknown id changes nothing', () => {
    let s = apply(emptyState(), { kind: 'capture', sight: sightOf({ id: 'a' }) }).state;
    s = apply(s, { kind: 'capture', sight: sightOf({ id: 'b' }) }).state;
    const del = apply(s, { kind: 'delete', id: 'a' });
    expect(del.state.sights.map((x) => x.id)).toEqual(['b']);
    expect(del.saves).toBe(true);
    const none = apply(s, { kind: 'delete', id: 'zzz' });
    expect(none.state).toBe(s);
    expect(none.saves).toBe(false);
  });

  it('starts again: no Sights, the Index error kept (Req 12.3)', () => {
    let s = apply(emptyState(), { kind: 'save_index_error', indexError: IE }).state;
    s = apply(s, { kind: 'capture', sight: sightOf({ id: 'a' }) }).state;
    const r = apply(s, { kind: 'start_again' });
    expect(r.state.sights).toEqual([]);
    expect(r.state.indexError).toEqual(IE);
  });

  it('saves an Index error replacing the earlier one, and removes it', () => {
    let s = apply(emptyState(), { kind: 'save_index_error', indexError: IE }).state;
    const later = { ...IE, valueRad: 0.01, measuredUtcMs: 2_000 };
    s = apply(s, { kind: 'save_index_error', indexError: later }).state;
    expect(s.indexError).toEqual(later);
    s = apply(s, { kind: 'remove_index_error' }).state;
    expect(s.indexError).toBeNull();
  });

  it('refuses to save an Index error beyond MAX_INDEX_ERROR_RAD, or with a number that is not finite', () => {
    const big = apply(emptyState(), {
      kind: 'save_index_error',
      indexError: { ...IE, valueRad: params.maxIndexErrorRad * 1.01 },
    });
    expect(big.failure?.reason).toBe('index_error_implausible');
    const nan = apply(emptyState(), {
      kind: 'save_index_error',
      indexError: { ...IE, sigmaRad: Number.NaN },
    });
    expect(nan.failure?.reason).toBe('invalid_number');
    expect(nan.state.indexError).toBeNull();
  });

  it('reload replaces the state with the one given', () => {
    const loaded = apply(emptyState(), { kind: 'capture', sight: sightOf({ id: 'x' }) }).state;
    const r = apply(emptyState(), { kind: 'reload', state: loaded });
    expect(r.state).toEqual(loaded);
    expect(r.saves).toBe(false);
  });
});
