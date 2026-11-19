// `storageActions` (design §11, Req 4.7): a sequence of 0 to 200 abstract steps on the Incident
// store, and the interpreter that turns a step into a `VigiaAction` for the state it meets. Test
// support, not exported. P-15.9 extends the steps with the actions of Requirements 3 to 14.
//
// Domain. A step is one of: `create` (an Incident id from a pool of four device ids and one
// Simulation id), `join` (a code of an Incident the phone does not hold, added with
// `joinIfUnknown`), `capture` (a local Sighting in the open Incident), `receive` (a received
// Sighting of a pool Incident, the same code again one draw in four, a different code under the
// same Sighting id one draw in six), `hide`, `show`, `delete` (a Sighting held, or an id of the
// pool when none is), `deleteIncident`, `deleteAll`, `expire` (the clock moves 0 to 40 hours),
// `reload` (serialise, parse, replace) and `share`; and two bursts that reach the limits: `fill`
// (20 to 40 Sightings received at once into one Incident, so that it fills to 32 and refuses the
// rest) and `shareMany` (15 to 30 share records of one Sighting, so that the 20 of an entry are
// passed). Sightings come from a pool of 40 numbers;
// the content of a Sighting is a function of its number, its Incident and its variant, so that
// the same step twice is the same code. Excludes everything else.

import fc from 'fast-check';
import { uniformInteger } from './generators';
import {
  canonicalOf,
  INCIDENT_ID,
  NOW_UTC_MS,
  SIMULATION_INCIDENT_ID,
  sightingIdOf,
} from './incident-fixtures';
import { applyAction, type VigiaAction } from '../math/incident/apply-action';
import {
  emptyState,
  type InboxItem,
  type ShareRecord,
  type VigiaState,
} from '../math/incident/incident-state';
import type { VigiaParameters } from '../math/parameters';

/** Four device Incident ids and one Simulation Incident id (the first symbol Z). */
export const INCIDENT_POOL: readonly string[] = [
  INCIDENT_ID,
  'C222222222',
  'D4N8RTY5CM',
  'H7PQ3MWXAB',
  SIMULATION_INCIDENT_ID,
];
export const SIGHTING_POOL_SIZE = 40;

export type Step =
  | { readonly kind: 'create'; readonly incident: number }
  | { readonly kind: 'join'; readonly incident: number; readonly sighting: number }
  | { readonly kind: 'capture'; readonly sighting: number }
  | {
      readonly kind: 'receive';
      readonly incident: number;
      readonly sighting: number;
      readonly variant: 0 | 1;
    }
  | { readonly kind: 'hide' | 'show' | 'delete'; readonly pick: number }
  | { readonly kind: 'share'; readonly pick: number; readonly channelPick: number }
  | { readonly kind: 'deleteIncident'; readonly incident: number }
  | { readonly kind: 'deleteAll' }
  /** A burst: `count` Sightings of the pool received at once into one Incident (made if unknown). */
  | { readonly kind: 'fill'; readonly incident: number; readonly count: number }
  /** A burst: `count` share records of one Sighting, to reach the limit of 20. */
  | { readonly kind: 'shareMany'; readonly pick: number; readonly count: number }
  | { readonly kind: 'expire'; readonly jumpMs: number }
  | { readonly kind: 'reload' };

const CHANNELS = ['link', 'qr', 'text', 'system_share', 'memory'] as const;

export function storageActions(): fc.Arbitrary<Step[]> {
  const incident = uniformInteger(0, INCIDENT_POOL.length - 1);
  const sighting = uniformInteger(1, SIGHTING_POOL_SIZE);
  const pick = uniformInteger(0, 999);
  const step = fc.oneof(
    { weight: 3, arbitrary: incident.map((i): Step => ({ kind: 'create', incident: i })) },
    {
      weight: 2,
      arbitrary: fc
        .tuple(incident, sighting)
        .map(([i, s]): Step => ({ kind: 'join', incident: i, sighting: s })),
    },
    { weight: 6, arbitrary: sighting.map((s): Step => ({ kind: 'capture', sighting: s })) },
    {
      weight: 8,
      arbitrary: fc
        .tuple(
          incident,
          sighting,
          fc.oneof(
            { weight: 5, arbitrary: fc.constant(0 as const) },
            { weight: 1, arbitrary: fc.constant(1 as const) },
          ),
        )
        .map(([i, s, variant]): Step => ({ kind: 'receive', incident: i, sighting: s, variant })),
    },
    { weight: 2, arbitrary: pick.map((p): Step => ({ kind: 'hide', pick: p })) },
    { weight: 2, arbitrary: pick.map((p): Step => ({ kind: 'show', pick: p })) },
    { weight: 2, arbitrary: pick.map((p): Step => ({ kind: 'delete', pick: p })) },
    {
      weight: 2,
      arbitrary: fc.tuple(pick, uniformInteger(0, CHANNELS.length - 1)).map(([p, c]): Step => ({
        kind: 'share',
        pick: p,
        channelPick: c,
      })),
    },
    { weight: 1, arbitrary: incident.map((i): Step => ({ kind: 'deleteIncident', incident: i })) },
    { weight: 1, arbitrary: fc.constant<Step>({ kind: 'deleteAll' }) },
    {
      weight: 2,
      arbitrary: fc
        .tuple(incident, uniformInteger(20, 40))
        .map(([i, count]): Step => ({ kind: 'fill', incident: i, count })),
    },
    {
      weight: 2,
      arbitrary: fc
        .tuple(pick, uniformInteger(15, 30))
        .map(([p, count]): Step => ({ kind: 'shareMany', pick: p, count })),
    },
    {
      weight: 2,
      arbitrary: fc
        .oneof(
          { weight: 2, arbitrary: fc.constant(0) },
          { weight: 2, arbitrary: uniformInteger(0, 40 * 3_600_000) },
        )
        .map((jumpMs): Step => ({ kind: 'expire', jumpMs })),
    },
    { weight: 2, arbitrary: fc.constant<Step>({ kind: 'reload' }) },
  );
  // `size: 'max'`: the lengths reach 200. With fast-check's default size the longest of 2 000
  // draws was 10 steps (measured after task group 13).
  return fc.array(step, { minLength: 0, maxLength: 200, size: 'max' });
}

/** The content of a Sighting of the pool: fixed by its number, its Incident and its variant. */
export function poolSighting(
  sighting: number,
  incidentId: string,
  variant: 0 | 1,
  origin: 'local' | 'received',
  receivedUtcMs: number | null,
) {
  return canonicalOf(
    sighting,
    incidentId,
    {
      timeUtcMs: NOW_UTC_MS + 1000 * sighting,
      azimuthRad: variant === 0 ? 0.5 + 0.01 * sighting : 2.5,
    },
    origin,
    receivedUtcMs,
  );
}

/** The entries of a state, flattened in Incident order then Sighting id order. */
export function heldIds(state: VigiaState): string[] {
  return state.incidents.flatMap((i) => i.entries.map((e) => e.sighting.sightingId));
}

/** The id a `pick` names: a held one, or an id of the pool (`pick` modulo) when none is held. */
function pickId(state: VigiaState, pick: number): string {
  const held = heldIds(state);
  return held.length > 0
    ? (held[pick % held.length] ?? sightingIdOf(1))
    : sightingIdOf(1 + (pick % SIGHTING_POOL_SIZE));
}

/**
 * The actions of `step` for `state` at clock time `nowUtcMs`, in order: one for most steps, many
 * for a burst; `null` for a step that is not an action (`reload` is done by the test, which needs
 * the serialiser). `expire` advances the clock by the step's jump: the caller reads the new time
 * from `clockAfter`. The actions of a burst are fixed from `state` before the first is applied.
 */
export function actionsOf(step: Step, state: VigiaState, nowUtcMs: number): VigiaAction[] | null {
  if (step.kind === 'fill') {
    const incidentId = INCIDENT_POOL[step.incident] ?? INCIDENT_ID;
    return Array.from({ length: step.count }, (_, k): VigiaAction => {
      const { sighting, code } = poolSighting(k + 1, incidentId, 0, 'received', null);
      const item: InboxItem = {
        code,
        sighting: { ...sighting, receivedUtcMs: null },
        arrivedUtcMs: nowUtcMs,
      };
      return { kind: 'addReceived', item, nowUtcMs, joinIfUnknown: true };
    });
  }
  if (step.kind === 'shareMany') {
    const sightingId = pickId(state, step.pick);
    return Array.from({ length: step.count }, (_, k): VigiaAction => ({
      kind: 'markShared',
      sightingId,
      record: { channel: CHANNELS[k % CHANNELS.length] ?? 'text', atUtcMs: nowUtcMs + k },
    }));
  }
  const one = actionOf(step, state, nowUtcMs);
  return one === null ? null : [one];
}

/** The action of a step that is one action (see `actionsOf`). */
function actionOf(step: Step, state: VigiaState, nowUtcMs: number): VigiaAction | null {
  const id = (n: number): string => INCIDENT_POOL[n] ?? INCIDENT_ID;
  switch (step.kind) {
    case 'create':
      return { kind: 'createIncident', incidentId: id(step.incident), nowUtcMs };
    case 'join': {
      const { sighting, code } = poolSighting(
        step.sighting,
        id(step.incident),
        0,
        'received',
        null,
      );
      const item: InboxItem = {
        code,
        sighting: { ...sighting, receivedUtcMs: null },
        arrivedUtcMs: nowUtcMs,
      };
      return { kind: 'addReceived', item, nowUtcMs, joinIfUnknown: true };
    }
    case 'capture': {
      const open = state.openIncidentId ?? INCIDENT_ID;
      const { sighting, code } = poolSighting(step.sighting, open, 0, 'local', null);
      return { kind: 'addLocal', sighting, code, nowUtcMs };
    }
    case 'receive': {
      const { sighting, code } = poolSighting(
        step.sighting,
        id(step.incident),
        step.variant,
        'received',
        null,
      );
      const item: InboxItem = {
        code,
        sighting: { ...sighting, receivedUtcMs: null },
        arrivedUtcMs: nowUtcMs,
      };
      return { kind: 'addReceived', item, nowUtcMs, joinIfUnknown: false };
    }
    case 'hide':
      return { kind: 'hide', sightingId: pickId(state, step.pick) };
    case 'show':
      return { kind: 'show', sightingId: pickId(state, step.pick) };
    case 'delete':
      return { kind: 'deleteSighting', sightingId: pickId(state, step.pick) };
    case 'share': {
      const record: ShareRecord = {
        channel: CHANNELS[step.channelPick] ?? 'text',
        atUtcMs: nowUtcMs,
      };
      return { kind: 'markShared', sightingId: pickId(state, step.pick), record };
    }
    case 'deleteIncident':
      return { kind: 'deleteIncident', incidentId: id(step.incident) };
    case 'deleteAll':
      return { kind: 'deleteAll' };
    case 'expire':
      return { kind: 'expire', nowUtcMs: nowUtcMs + step.jumpMs };
    case 'reload':
    case 'fill':
    case 'shareMany':
      return null;
  }
}

/** The clock after a step: only `expire` moves it. */
export function clockAfter(step: Step, nowUtcMs: number): number {
  return step.kind === 'expire' ? nowUtcMs + step.jumpMs : nowUtcMs;
}

/**
 * The state a sequence of steps reaches, skipping the steps the reducer refuses and the reloads
 * (for the tests that need a state that has really been built, and not one made up).
 */
export function stateAfter(steps: readonly Step[], parameters: VigiaParameters): VigiaState {
  let state = emptyState();
  let nowUtcMs = NOW_UTC_MS;
  for (const step of steps) {
    for (const action of actionsOf(step, state, nowUtcMs) ?? []) {
      const result = applyAction(state, action, parameters);
      if (result.ok) state = result.value.state;
    }
    nowUtcMs = clockAfter(step, nowUtcMs);
  }
  return state;
}
