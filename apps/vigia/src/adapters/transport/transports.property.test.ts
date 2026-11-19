// P-9.6 and P-9.7 (Req 9.5, 9.6, 9.7, 9.9, design §11).
//
// Generator: `deliveryCase` (test-support/delivery-case.ts, domain stated there): 2 to 12 canonical
// Sightings with distinct ids sent by random phones among 2 to 4, with, for each recipient, a list
// of 0 to 2 delivery steps of 0 to 3 copies after 0 to 50 ms. Every case is run through the memory
// network and through the second Transport of the test support (`createRelayLikeTransport`, built
// differently), as Req 9.9 asks.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assess } from '../../math/assessment/assess';
import { emptyState, type VigiaState } from '../../math/incident/incident-state';
import {
  deliveryCase,
  expectedCopies,
  runDelivery,
  stateFromCodes,
  type DeliveryCase,
  type PhoneRun,
  type TransportKind,
} from '../../test-support/delivery-case';
import { cappedRuns, isDeepRun } from '../../test-support/fast-check-setup';
import { uniformInteger } from '../../test-support/generators';
import { NOW_UTC_MS, PARAMETERS } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';

const KINDS: readonly TransportKind[] = ['memory', 'relay'];
const ONE_INCIDENT = ['K7PQ3MWXA2'] as const;
const THREE_INCIDENTS = ['K7PQ3MWXA2', 'C222222222', 'D4N8RTY5CM'] as const;

/** The codes a phone is expected to hold: those the plan delivers to it at least once. */
function expectedCodes(delivery: DeliveryCase, phoneIndex: number): string[] {
  return [...expectedCopies(delivery, phoneIndex).keys()].sort();
}

function heldCodes(state: VigiaState): string[] {
  return state.incidents.flatMap((i) => i.entries.map((e) => e.code)).sort();
}

/** The state with its Incidents in order of id, so that arrival order does not matter. */
function byIncidentId(state: VigiaState): VigiaState['incidents'] {
  return [...state.incidents].sort((a, b) => (a.incidentId < b.incidentId ? -1 : 1));
}

describe('P-9.6: delivery in any order, with duplication and loss, gives the union (Req 9.5, 9.6, 9.9)', () => {
  it('each phone holds exactly the codes that reached it, and the same set gives the same Fix, through both Transports', () => {
    const tracker = new ErrorTracker();
    let phonesChecked = 0;
    let equalSetPairs = 0;
    let emptyPhones = 0;
    checkProperty(
      'P-9.6',
      fc.property(
        deliveryCase(ONE_INCIDENT),
        fc.array(uniformInteger(0, 1_000_000), { minLength: 12, maxLength: 12 }),
        (delivery, shuffleKeys) => {
          for (const kind of KINDS) {
            const runs = runDelivery(kind, delivery);
            const sets: string[][] = [];
            runs.forEach((run, phoneIndex) => {
              phonesChecked += 1;
              const copies = expectedCopies(delivery, phoneIndex);
              // The Transport delivered every copy the plan made, and nothing else.
              const seen = new Map<string, number>();
              for (const text of run.seen) seen.set(text, (seen.get(text) ?? 0) + 1);
              expect(seen, `${kind} phone ${phoneIndex} deliveries`).toEqual(copies);
              // The Sighting set is the union of the codes that arrived at least once.
              const expected = expectedCodes(delivery, phoneIndex);
              sets.push(expected);
              if (expected.length === 0) emptyPhones += 1;
              expect(heldCodes(run.state), `${kind} phone ${phoneIndex} set`).toEqual(expected);
              // The same codes, added in another order and each twice, give the same state and the
              // same assessment to the last bit (Req 9.6).
              const permuted = [...expected, ...expected]
                .map((code, i) => ({ code, key: shuffleKeys[i % shuffleKeys.length] ?? 0, i }))
                .sort((a, b) => a.key - b.key || a.i - b.i)
                .map((x) => x.code);
              const reference = stateFromCodes(permuted);
              expect(byIncidentId(run.state)).toEqual(byIncidentId(reference));
              for (const incident of byIncidentId(run.state)) {
                const held = reference.incidents.find((i) => i.incidentId === incident.incidentId);
                if (held === undefined) throw new Error('reference lacks an Incident');
                expect(assess(incident, NOW_UTC_MS, PARAMETERS)).toEqual(
                  assess(held, NOW_UTC_MS, PARAMETERS),
                );
              }
            });
            // Two phones that received the same set hold deeply equal states and assessments.
            checkSamePairs(runs, sets, () => {
              equalSetPairs += 1;
            });
          }
        },
      ),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
    if (isDeepRun()) {
      console.log(
        `[deep] P-9.6 counters: ${phonesChecked} phone runs (both Transports), ${emptyPhones} phones that received nothing, ${equalSetPairs} pairs of phones with the same set (compared deeply)`,
      );
    }
    expect(phonesChecked).toBeGreaterThan(0);
    // The property is not vacuous: some phones got nothing, and some pairs got the same set.
    expect(emptyPhones).toBeGreaterThan(0);
    expect(equalSetPairs).toBeGreaterThan(0);
  });
});

function checkSamePairs(runs: readonly PhoneRun[], sets: readonly string[][], onPair: () => void) {
  for (let a = 0; a < runs.length; a += 1) {
    for (let b = a + 1; b < runs.length; b += 1) {
      const runA = runs[a];
      const runB = runs[b];
      const setA = sets[a];
      const setB = sets[b];
      if (runA === undefined || runB === undefined || setA === undefined || setB === undefined)
        continue;
      if (setA.length === 0 || setA.join() !== setB.join()) continue;
      onPair();
      expect(byIncidentId(runA.state)).toEqual(byIncidentId(runB.state));
      const incidentA = runA.state.incidents[0];
      const incidentB = runB.state.incidents[0];
      if (incidentA === undefined || incidentB === undefined) throw new Error('no Incident');
      expect(assess(incidentA, NOW_UTC_MS, PARAMETERS)).toEqual(
        assess(incidentB, NOW_UTC_MS, PARAMETERS),
      );
    }
  }
}

describe('P-9.7: an Incident holds only the Sightings of its own id (Req 9.7)', () => {
  it('with codes of three Incident ids mixed in, each Incident holds exactly its own, through both Transports', () => {
    const tracker = new ErrorTracker();
    let mixedPhones = 0;
    checkProperty(
      'P-9.7',
      fc.property(deliveryCase(THREE_INCIDENTS), (delivery) => {
        for (const kind of KINDS) {
          const runs = runDelivery(kind, delivery);
          runs.forEach((run, phoneIndex) => {
            const copies = expectedCopies(delivery, phoneIndex);
            const owners = new Map<string, Set<string>>();
            for (const item of delivery.items) {
              if (!copies.has(item.code)) continue;
              const set = owners.get(item.sighting.incidentId) ?? new Set<string>();
              set.add(item.code);
              owners.set(item.sighting.incidentId, set);
            }
            if (owners.size > 1) mixedPhones += 1;
            // One Incident for each id that reached the phone, and no other.
            expect(run.state.incidents.map((i) => i.incidentId).sort()).toEqual(
              [...owners.keys()].sort(),
            );
            for (const incident of run.state.incidents) {
              for (const entry of incident.entries) {
                expect(entry.sighting.incidentId).toBe(incident.incidentId);
              }
              expect(incident.entries.map((e) => e.code).sort()).toEqual(
                [...(owners.get(incident.incidentId) ?? [])].sort(),
              );
            }
          });
        }
      }),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
    if (isDeepRun()) {
      console.log(
        `[deep] P-9.7 counters: ${mixedPhones} phone runs that held two or more Incidents`,
      );
    }
    expect(mixedPhones).toBeGreaterThan(0);
  });
});

describe('the harness of P-9.6 and P-9.7 is not vacuous', () => {
  it('a phone that is given nothing holds the empty state', () => {
    expect(heldCodes(emptyState())).toEqual([]);
  });

  it('a code delivered to a phone through the plan is held, and a lost one is not', () => {
    const sample = fc.sample(deliveryCase(ONE_INCIDENT), { numRuns: 30, seed: 7 });
    let held = 0;
    let lost = 0;
    for (const delivery of sample) {
      for (const kind of KINDS) {
        runDelivery(kind, delivery).forEach((run, phoneIndex) => {
          const reached = new Set(expectedCopies(delivery, phoneIndex).keys());
          for (const item of delivery.items) {
            if (item.senderIndex === phoneIndex) continue;
            const has = heldCodes(run.state).includes(item.code);
            expect(has).toBe(reached.has(item.code));
            if (has) held += 1;
            else lost += 1;
          }
        });
      }
    }
    expect(held).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });
});
