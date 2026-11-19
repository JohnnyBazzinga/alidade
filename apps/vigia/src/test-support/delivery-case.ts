// `deliveryPlan` (design §11, Req 9.6, 9.7): a set of Sightings, the phones they travel between and,
// for each Sighting and each recipient, the deliveries it makes; and the harness that runs a case
// through a Transport and reads what each phone ends with. Test support, not exported.
//
// Domain of `deliveryCase`: 2 to 4 phones (`phone-0` …); 2 to 12 Sightings on a `codeBearing`
// (design §11) with distinct ids, their times moved to one hour (`NOW_UTC_MS − 20 minutes` plus a
// whole number of minutes to 19) so that the assessment of them uses some and sets some aside; each
// Sighting canonical, sent by one phone chosen at random; for each other phone a list of 0 to 2
// delivery steps of 0 to 3 copies after 0 to 50 ms (so loss, duplication and reordering all occur).
// Each Sighting's Incident id is drawn from the `incidentIds` given (one id for P-9.6, three for
// P-9.7). It excludes: more than 12 Sightings (the maximum is 32 and `incident_full` has an example
// test), two codes under one id (`sighting_conflict` has an example test), and a phone that joins
// after a send.

import fc from 'fast-check';
import { createMemoryNetwork } from '../adapters/transport/memory-network';
import { decodeSighting } from '../math/code/sighting-code';
import { applyAction } from '../math/incident/apply-action';
import { emptyState, type VigiaState } from '../math/incident/incident-state';
import { canonicalise, type Sighting } from '../math/incident/sighting';
import type { DeliveryPlan, DeliveryStep, Transport } from '../math/transport/transport';
import { FakeTimer } from './fake-timer';
import { codeBearing, uniformInteger } from './generators';
import { NOW_UTC_MS, PARAMETERS } from './incident-fixtures';
import { createRelayLikeTransport } from './relay-like-transport';

/** The time at which every received code is added, so that every phone stamps the same one. */
export const RECEIVE_UTC_MS = NOW_UTC_MS + 3_600_000;

export interface DeliveryItem {
  readonly sighting: Sighting;
  readonly code: string;
  readonly senderIndex: number;
  /** For each phone index, the deliveries to it (the sender's own is unused). */
  readonly steps: readonly (readonly DeliveryStep[])[];
}

export interface DeliveryCase {
  readonly phoneIds: readonly string[];
  readonly items: readonly DeliveryItem[];
}

export function deliveryCase(incidentIds: readonly string[]): fc.Arbitrary<DeliveryCase> {
  const step = fc.record({
    copies: uniformInteger(0, 3),
    delayMs: uniformInteger(0, 50),
  });
  return uniformInteger(2, 4).chain((phoneCount) =>
    fc
      .uniqueArray(codeBearing(), { minLength: 2, maxLength: 12, selector: (b) => b.id })
      .chain((bearings) =>
        fc.tuple(
          ...bearings.map((bearing, index) =>
            fc.tuple(
              uniformInteger(0, incidentIds.length - 1),
              uniformInteger(0, phoneCount - 1),
              fc.tuple(
                ...Array.from({ length: phoneCount }, () => fc.array(step, { maxLength: 2 })),
              ),
              fc.constant({ bearing, index }),
            ),
          ),
        ),
      )
      .map((drawn): DeliveryCase => {
        const items = drawn.map(([incidentIndex, senderIndex, steps, { bearing, index }]) => {
          const incidentId = incidentIds[incidentIndex];
          if (incidentId === undefined) throw new Error('no incident id');
          const canonical = canonicalise(
            {
              sightingId: bearing.id,
              incidentId,
              bearing: { ...bearing, timeUtcMs: NOW_UTC_MS - 1_200_000 + (index % 20) * 60_000 },
              origin: 'local',
              receivedUtcMs: null,
            },
            PARAMETERS,
          );
          if (!canonical.ok) throw new Error(`canonicalise failed: ${canonical.reason}`);
          return {
            sighting: canonical.value.sighting,
            code: canonical.value.code,
            senderIndex,
            steps,
          };
        });
        return { phoneIds: Array.from({ length: phoneCount }, (_, i) => `phone-${i}`), items };
      }),
  );
}

/** The plan of a case: what the Sighting with this code does to the phone `to`. */
export function planOf(delivery: DeliveryCase): DeliveryPlan {
  return (_from, to, code) => {
    const item = delivery.items.find((i) => i.code === code);
    const index = delivery.phoneIds.indexOf(to);
    return item?.steps[index] ?? [];
  };
}

/** How many times the plan delivers each code to the phone (the sender gets none of its own). */
export function expectedCopies(delivery: DeliveryCase, phoneIndex: number): Map<string, number> {
  const copies = new Map<string, number>();
  for (const item of delivery.items) {
    if (item.senderIndex === phoneIndex) continue;
    const count = (item.steps[phoneIndex] ?? []).reduce((sum, s) => sum + s.copies, 0);
    if (count > 0) copies.set(item.code, count);
  }
  return copies;
}

export function largestDelayMs(delivery: DeliveryCase): number {
  return Math.max(
    0,
    ...delivery.items.flatMap((i) => i.steps.flatMap((steps) => steps.map((s) => s.delayMs))),
  );
}

export type TransportKind = 'memory' | 'relay';

export interface PhoneRun {
  readonly id: string;
  /** Every text the Transport delivered to the phone, in order. */
  readonly seen: readonly string[];
  readonly state: VigiaState;
}

/**
 * Sends every Sighting of the case from its sender through the Transport of `kind`, advances a
 * FakeTimer past the largest delay, and reads what each phone ends with. A phone's own receipt is
 * the store's: decode the text, and add it to the Incident of its id (creating it: `joinIfUnknown`),
 * which is what the Inbox's "add all" does. A text that fails to decode is not added.
 */
export function runDelivery(kind: TransportKind, delivery: DeliveryCase): PhoneRun[] {
  const timer = new FakeTimer();
  const plan = planOf(delivery);
  const network =
    kind === 'memory' ? createMemoryNetwork(plan, timer) : createRelayLikeTransport(plan, timer);
  const runs = delivery.phoneIds.map((id) => ({ id, seen: [] as string[], state: emptyState() }));
  const transports: Transport[] = runs.map((run) => {
    const transport = network.join(run.id);
    transport.onReceive((text) => {
      run.seen.push(text);
      run.state = addCode(run.state, text);
    });
    return transport;
  });
  for (const item of delivery.items) {
    void transports[item.senderIndex]?.send(item.code);
  }
  timer.advance(largestDelayMs(delivery) + 2);
  return runs;
}

/** The state after adding the code the way the Inbox does. */
export function addCode(state: VigiaState, text: string): VigiaState {
  const decoded = decodeSighting(text, PARAMETERS);
  if (!decoded.ok) return state;
  const applied = applyAction(
    state,
    {
      kind: 'addReceived',
      item: { code: text, sighting: decoded.value, arrivedUtcMs: RECEIVE_UTC_MS },
      nowUtcMs: RECEIVE_UTC_MS,
      joinIfUnknown: true,
    },
    PARAMETERS,
  );
  return applied.ok ? applied.value.state : state;
}

/** The state of a phone that was given exactly these codes, in this order (duplicates included). */
export function stateFromCodes(codes: readonly string[]): VigiaState {
  return codes.reduce(addCode, emptyState());
}
