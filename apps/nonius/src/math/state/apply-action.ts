// The reducer over the saved data (Req 12.1 to 12.5, 15.5; design D18): the Sights and at most one
// Index error. Nothing else is in this state: the user's choice of place, the Comparison and the
// Index error session are memory-only parts that the store holds beside it.

import { err, type NoniusFailure } from '../../result';
import type { NoniusParameters } from '../parameters';
import { checkSight, type Sight } from '../sight/sight';
import type { IndexError } from '../sight/index-error';

export interface NoniusState {
  readonly sights: readonly Sight[];
  readonly indexError: IndexError | null;
}

export type Action =
  | { readonly kind: 'capture'; readonly sight: Sight }
  | { readonly kind: 'delete'; readonly id: string }
  | { readonly kind: 'start_again' }
  | { readonly kind: 'save_index_error'; readonly indexError: IndexError }
  | { readonly kind: 'remove_index_error' }
  | { readonly kind: 'reload'; readonly state: NoniusState };

export interface ActionResult {
  readonly state: NoniusState;
  /** Why the action was refused; the state is then the one given. */
  readonly failure: NoniusFailure | null;
  /** Whether the saved data changed, so that the store saves. */
  readonly saves: boolean;
}

export function emptyState(): NoniusState {
  return { sights: [], indexError: null };
}

/** The first thing wrong with an Index error's numbers, or `null`. */
export function checkIndexError(
  indexError: IndexError,
  params: NoniusParameters,
): NoniusFailure | null {
  const numbers: readonly [string, number][] = [
    ['valueRad', indexError.valueRad],
    ['sigmaRad', indexError.sigmaRad],
    ['sightCount', indexError.sightCount],
    ['measuredUtcMs', indexError.measuredUtcMs],
  ];
  for (const [field, value] of numbers) {
    if (!Number.isFinite(value)) return err('invalid_number', { field });
  }
  if (indexError.sigmaRad < 0) return err('invalid_number', { field: 'sigmaRad' });
  if (!Number.isInteger(indexError.sightCount) || indexError.sightCount < 1) {
    return err('invalid_number', { field: 'sightCount' });
  }
  if (Math.abs(indexError.valueRad) > params.maxIndexErrorRad) {
    return err('index_error_implausible', { field: 'valueRad' });
  }
  return null;
}

const refused = (state: NoniusState, failure: NoniusFailure): ActionResult => ({
  state,
  failure,
  saves: false,
});
const changed = (state: NoniusState): ActionResult => ({ state, failure: null, saves: true });

/** Applies one action. Total: a refused action returns the state it was given. */
export function applyAction(
  state: NoniusState,
  action: Action,
  params: NoniusParameters,
): ActionResult {
  switch (action.kind) {
    case 'capture': {
      const bad = checkSight(action.sight);
      if (bad !== null) return refused(state, bad);
      if (state.sights.some((s) => s.id === action.sight.id)) {
        return refused(state, err('invalid_observation', { id: action.sight.id, field: 'id' }));
      }
      if (state.sights.length >= params.maxSights) return refused(state, err('sights_full'));
      return changed({ ...state, sights: [...state.sights, action.sight] });
    }
    case 'delete': {
      if (!state.sights.some((s) => s.id === action.id)) {
        return { state, failure: null, saves: false };
      }
      return changed({ ...state, sights: state.sights.filter((s) => s.id !== action.id) });
    }
    case 'start_again':
      return changed({ ...state, sights: [] });
    case 'save_index_error': {
      const bad = checkIndexError(action.indexError, params);
      return bad === null
        ? changed({ ...state, indexError: action.indexError })
        : refused(state, bad);
    }
    case 'remove_index_error':
      return changed({ ...state, indexError: null });
    case 'reload':
      return { state: action.state, failure: null, saves: false };
  }
}
