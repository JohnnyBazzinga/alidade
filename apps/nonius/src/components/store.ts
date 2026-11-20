// The store of the app (design D18; Req 7.4, 11.4, 12): the one place that runs the effects of the
// pure reducer. It holds the saved data (the Sights and the Index error), the Assessment computed
// once per change (never on a render), and the memory-only parts: the user's choice of place, the
// Comparison and its failure, and the notices. Only the saved data is ever written to storage.

import { createContext, useContext, useSyncExternalStore } from 'react';
import { assess, type Assessment, type UserChoice } from '../math/fix/assess';
import { compare, type Comparison } from '../math/fix/comparison';
import { applyAction, emptyState, type Action, type NoniusState } from '../math/state/apply-action';
import { parseStoredState, serialiseState } from '../math/state/storage-format';
import type { NoniusReason } from '../reasons';
import type { NoniusFailure, NoniusResult } from '../result';
import { ok } from '../result';
import type { NoniusEnvironment } from './environment';

/** A notice the screens show until the app is reloaded; one per reason. */
export interface ScreenNotice {
  readonly reason: NoniusReason;
  /** How many saved items were left out (`storage_corrupt`). */
  readonly count?: number;
}

export interface NoniusSnapshot {
  readonly state: NoniusState;
  readonly assessment: NoniusResult<Assessment>;
  /** Memory only: the place the user chose of Two places, for the used set it was made on. */
  readonly userChoice: UserChoice | null;
  /** Memory only: the GPS Comparison with the Shown Fix. */
  readonly comparison: Comparison | null;
  readonly comparisonFailure: NoniusFailure | null;
  readonly notices: readonly ScreenNotice[];
}

export interface NoniusStore {
  getSnapshot(): NoniusSnapshot;
  subscribe(listener: () => void): () => void;
  /** Runs the reducer; saves when saved data changed. A refusal is returned and changes nothing. */
  dispatch(action: Action): NoniusResult<null>;
  chooseUserPlace(placeIndex: 0 | 1): void;
  undoChoice(): void;
  /** Asks the location once and compares it with the Shown Fix (Req 11.2); only for a Shown Fix. */
  compareWithGps(): Promise<void>;
}

export function createNoniusStore(environment: NoniusEnvironment): NoniusStore {
  const { parameters, storage } = environment;
  const notices: ScreenNotice[] = [];
  const notify = (reason: NoniusReason, count?: number): void => {
    if (notices.some((n) => n.reason === reason)) return;
    notices.push(count === undefined ? { reason } : { reason, count });
  };

  let writable = true;
  let state = emptyState();
  const read = storage.read();
  if (!read.ok) {
    notify('storage_unavailable');
  } else {
    const parsed = parseStoredState(read.value, parameters);
    if (!parsed.ok) {
      notify(parsed.reason);
    } else if (parsed.value.kind === 'loaded') {
      state = parsed.value.state;
      if (parsed.value.dropped > 0) notify('storage_corrupt', parsed.value.dropped);
    } else if (parsed.value.kind === 'corrupt') {
      const kept = storage.writeBackup(parsed.value.raw);
      if (!kept.ok) notify('storage_unavailable');
      notify('storage_corrupt');
    } else if (parsed.value.kind === 'newer') {
      writable = false;
      notify('storage_version_unsupported');
    }
  }
  if (!storage.persistent) notify('storage_unavailable');

  let userChoice: UserChoice | null = null;
  let comparison: Comparison | null = null;
  let comparisonFailure: NoniusFailure | null = null;
  let snapshot: NoniusSnapshot = build();
  const listeners = new Set<() => void>();

  function build(): NoniusSnapshot {
    return {
      state,
      assessment: assess(state.sights, state.indexError, userChoice, parameters),
      userChoice,
      comparison,
      comparisonFailure,
      notices: [...notices],
    };
  }
  function publish(): void {
    snapshot = build();
    for (const listener of [...listeners]) listener();
  }
  const clearMemoryParts = (): void => {
    userChoice = null;
    comparison = null;
    comparisonFailure = null;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch(action) {
      const result = applyAction(state, action, parameters);
      if (result.failure !== null) return result.failure;
      state = result.state;
      if (result.saves) {
        // A change of the used set, or of the Index error, ends the choice and the Comparison.
        clearMemoryParts();
        if (writable) {
          const written = storage.write(serialiseState(state));
          if (!written.ok) notify('storage_unavailable');
        }
      }
      publish();
      return ok(null);
    },
    chooseUserPlace(placeIndex) {
      const a = snapshot.assessment;
      if (!a.ok || a.value.kind !== 'two_places') return;
      userChoice = { usedIdsKey: a.value.usedIdsKey, placeIndex };
      comparison = null;
      comparisonFailure = null;
      publish();
    },
    undoChoice() {
      if (userChoice === null) return;
      clearMemoryParts();
      publish();
    },
    async compareWithGps() {
      const a = snapshot.assessment;
      if (!a.ok || a.value.kind !== 'fix') return;
      const shown = a.value.fix;
      const located = await environment.askLocation();
      // The Fix may have changed while the phone was answering: the answer is then stale.
      const now = snapshot.assessment;
      if (!now.ok || now.value.kind !== 'fix' || now.value.fix !== shown) return;
      if (!located.ok) {
        comparison = null;
        comparisonFailure = located;
      } else {
        const compared = compare(shown, located.value.position, parameters);
        comparison = compared.ok ? compared.value : null;
        comparisonFailure = compared.ok ? null : compared;
      }
      publish();
    },
  };
}

const StoreContext = createContext<NoniusStore | null>(null);

export const StoreProvider = StoreContext.Provider;

/** The store of the screens; a programmer error outside a `StoreProvider`. */
export function useStore(): NoniusStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useStore outside a StoreProvider');
  return store;
}

/** The store's snapshot, kept current (`useSyncExternalStore`). */
export function useNonius(): NoniusSnapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
