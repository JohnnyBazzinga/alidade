// P-4.10 (Req 4.10; design §7.4a, §11): two to four phones that each start their own Incident
// converge to one smoke, and keep the smokes apart when the answer is "a different smoke".
//
// The model of the phones is the reducer itself (`applyAction`), driven as the store and the Inbox
// sheet drive it: a code of an id the phone holds, as its id or a former id, is added with no
// question; a code of another id, with an Incident open, is the question, and the answer is the
// same at every question in a run, "the same smoke" (`joinIncident`) or "a different smoke"
// (`addReceived` with `joinIfUnknown`). What the property checks is written from the requirement,
// not from the reducer: the ids, the sets of Sightings and the codes the phones end with.
//
// Domain of `joinGroups` (design §11):
//  - 2 to 4 phones; each has a first Incident id of 10 symbols, the first not `Z` (a device id),
//    the four pairwise different (`fc.uniqueArray`: no filter, so no case is discarded);
//  - each phone has 1 to 3 own Sightings, each with its own number, so at most 12 Sightings, under
//    the maximum of 32 (the case of too many Sightings has its own example, in `join.test.ts`);
//  - one answer for the whole run, "same" or "different";
//  - a script of 0 to 40 integers in `[0, 10⁶)`, read as steps (capture, send, process).
// Every phone starts its Incident and takes its first Sighting before any step: it starts its own
// Incident. After the script the run takes the Sightings that are still to take, and then SENDS,
// for every sender, every other phone and every own Sighting of the sender, a code that has not
// been sent yet, interleaved with the receivers' processing, and processes everything that waits.
// That is the premise of the requirement ("every phone's own Sightings reach every other phone"),
// and the convergence to the smallest first id rests on it: every phone must receive an own
// Sighting of the phone that started with that id, whose code carries that id.
// Excluded: a phone that receives a code before it has started its own Incident (no Incident
// open: the case of today's Inbox, with its own examples) and more than 3 own Sightings.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALPHABET } from '../code/alphabet';
import { decodeSighting } from '../code/sighting-code';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { symbols, uniformInteger } from '../../test-support/generators';
import { canonicalOf, PARAMETERS, sightingIdOf } from '../../test-support/incident-fixtures';
import { invariants } from '../../test-support/incident-invariants';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { applyAction, type VigiaAction } from './apply-action';
import { emptyState, type Incident, type InboxItem, type VigiaState } from './incident-state';

type Answer = 'same' | 'different';

interface Group {
  readonly firstIds: readonly string[];
  readonly counts: readonly number[];
  readonly answer: Answer;
  readonly script: readonly number[];
}

/** The ten symbols of a device id: the first is any but `Z` (the one of a simulation). */
const deviceId: fc.Arbitrary<string> = fc
  .tuple(
    uniformInteger(0, 29).map((i) => ALPHABET.charAt(i)),
    symbols(9),
  )
  .map(([first, rest]) => first + rest);

const joinGroups: fc.Arbitrary<Group> = fc.integer({ min: 2, max: 4 }).chain((phones) =>
  fc.record({
    firstIds: fc.uniqueArray(deviceId, { minLength: phones, maxLength: phones }),
    counts: fc.array(fc.integer({ min: 1, max: 3 }), { minLength: phones, maxLength: phones }),
    answer: fc.constantFrom<Answer>('same', 'different'),
    script: fc.array(fc.integer({ min: 0, max: 999_999 }), { minLength: 0, maxLength: 40 }),
  }),
);

interface Phone {
  readonly firstId: string;
  /** The numbers of the own Sightings, in the order they are taken. */
  readonly own: readonly number[];
  state: VigiaState;
  taken: number;
  /** The codes that wait to be processed, as they were when they were sent. */
  queue: string[];
  /** Every id this phone has held, as an id or a former id, ever. */
  everHeld: Set<string>;
  /** The question of Req 4.8 was asked this many times. */
  questions: number;
  /** For each other phone and each own Sighting, whether a code of it has been sent. */
  sent: Set<string>;
}

const NOW = 1_790_000_000_000;

function apply(phone: Phone, action: VigiaAction, where: string): void {
  const result = applyAction(phone.state, action, PARAMETERS);
  if (!result.ok) {
    throw new Error(`${where}: ${action.kind} refused with ${result.reason} ${result.field ?? ''}`);
  }
  phone.state = result.value.state;
  const problems = invariants(phone.state, PARAMETERS);
  if (problems.length > 0) throw new Error(`${where}: ${problems.join('; ')}`);
  for (const incident of phone.state.incidents) {
    phone.everHeld.add(incident.incidentId);
    for (const id of incident.formerIds) phone.everHeld.add(id);
  }
}

/** The Incident that holds the phone's first id, as its id or a former id. */
const ownIncident = (phone: Phone): Incident | undefined =>
  phone.state.incidents.find(
    (i) => i.incidentId === phone.firstId || i.formerIds.includes(phone.firstId),
  );

/** The phone takes its next own Sighting, in the Incident that holds its first id. */
function take(phone: Phone, where: string): void {
  const number = phone.own[phone.taken];
  if (number === undefined) throw new Error(`${where}: nothing left to take`);
  if (ownIncident(phone) === undefined) {
    apply(phone, { kind: 'createIncident', incidentId: phone.firstId, nowUtcMs: NOW }, where);
  }
  const holder = ownIncident(phone);
  if (holder === undefined) throw new Error(`${where}: no Incident of its own`);
  if (phone.state.openIncidentId !== holder.incidentId) {
    apply(phone, { kind: 'openIncident', incidentId: holder.incidentId }, where);
  }
  const { sighting, code } = canonicalOf(number, holder.incidentId);
  apply(phone, { kind: 'addLocal', sighting, code, nowUtcMs: NOW }, where);
  phone.taken += 1;
}

/** The code of own Sighting `number` as the phone holds it now. */
function codeOf(phone: Phone, number: number): string {
  for (const incident of phone.state.incidents) {
    for (const entry of incident.entries) {
      if (entry.sighting.sightingId === sightingIdOf(number)) return entry.code;
    }
  }
  throw new Error(`the phone does not hold Sighting ${number}`);
}

/** What the Inbox does with one code: the policy of design §7.4a, §9. */
function process(phone: Phone, code: string, answer: Answer, where: string): void {
  const decoded = decodeSighting(code, PARAMETERS);
  if (!decoded.ok) throw new Error(`${where}: a code that does not decode`);
  const item: InboxItem = {
    code,
    sighting: { ...decoded.value, origin: 'received', receivedUtcMs: null },
    arrivedUtcMs: NOW,
  };
  const id = decoded.value.incidentId;
  const holder = phone.state.incidents.find((i) => i.incidentId === id || i.formerIds.includes(id));
  if (holder !== undefined) {
    apply(phone, { kind: 'addReceived', item, nowUtcMs: NOW + 1, joinIfUnknown: false }, where);
    return;
  }
  // An id the phone has held never asks again: it is the id or a former id of what it holds.
  if (phone.everHeld.has(id)) throw new Error(`${where}: asked again about ${id}, which it held`);
  if (phone.state.openIncidentId === null) {
    apply(phone, { kind: 'addReceived', item, nowUtcMs: NOW + 1, joinIfUnknown: true }, where);
    return;
  }
  phone.questions += 1;
  if (answer === 'same') apply(phone, { kind: 'joinIncident', item, nowUtcMs: NOW + 1 }, where);
  else apply(phone, { kind: 'addReceived', item, nowUtcMs: NOW + 1, joinIfUnknown: true }, where);
}

interface Reach {
  readonly phones: number;
  readonly sightings: number;
  readonly questions: number;
  readonly mostFormerIds: number;
}

function run(group: Group, tracker: ErrorTracker): Reach {
  const { firstIds, counts, answer, script } = group;
  let next = 1;
  const phones: Phone[] = firstIds.map((firstId, index) => ({
    firstId,
    own: Array.from({ length: counts[index] ?? 1 }, () => next++),
    state: emptyState(),
    taken: 0,
    queue: [],
    everHeld: new Set(),
    questions: 0,
    sent: new Set(),
  }));
  const at = (index: number): Phone => {
    const phone = phones[index % phones.length];
    if (phone === undefined) throw new Error('no phone');
    return phone;
  };
  const send = (from: Phone, to: Phone, number: number): void => {
    to.queue.push(codeOf(from, number));
    from.sent.add(`${to.firstId}:${number}`);
  };
  const processOne = (phone: Phone, pick: number, where: string): void => {
    if (phone.queue.length === 0) return;
    const [code] = phone.queue.splice(pick % phone.queue.length, 1);
    if (code !== undefined) process(phone, code, answer, where);
  };

  // Each phone starts its own Incident with its first Sighting.
  phones.forEach((phone, k) => take(phone, `start ${k}`));

  script.forEach((n, step) => {
    const where = `step ${step} (${n})`;
    const kind = n % 3;
    const phone = at(Math.floor(n / 3));
    if (kind === 0) {
      if (phone.taken < phone.own.length) take(phone, where);
    } else if (kind === 1) {
      const to = at(Math.floor(n / 7) + 1);
      if (to === phone) return;
      const number = phone.own[Math.floor(n / 11) % phone.taken];
      if (number !== undefined) send(phone, to, number);
    } else {
      processOne(phone, Math.floor(n / 3), where);
    }
  });

  // What is still to take, taken.
  phones.forEach((phone, k) => {
    while (phone.taken < phone.own.length) take(phone, `rest ${k}`);
  });

  // The premise: every own Sighting of every phone reaches every other phone, in a code made at
  // the time of sending, in the order the script's integers give, interleaved with processing.
  const missing: { from: Phone; to: Phone; number: number }[] = [];
  for (const from of phones) {
    for (const to of phones) {
      if (to === from) continue;
      for (const number of from.own) {
        if (!from.sent.has(`${to.firstId}:${number}`)) missing.push({ from, to, number });
      }
    }
  }
  missing
    .map((m, i) => ({ m, key: script[(i * 7) % Math.max(1, script.length)] ?? i }))
    .sort((a, b) => a.key - b.key)
    .forEach(({ m, key }, i) => {
      send(m.from, m.to, m.number);
      if (key % 2 === 0) processOne(at(key), key, `final ${i}`);
    });
  for (let round = 0; phones.some((p) => p.queue.length > 0); round += 1) {
    phones.forEach((phone, k) =>
      processOne(phone, script[round % Math.max(1, script.length)] ?? 0, `drain ${round}.${k}`),
    );
  }

  // The checks, from the requirement.
  const everySighting = phones.flatMap((p) => p.own).sort((a, b) => a - b);
  const smallest = [...firstIds].sort()[0];
  let mostFormerIds = 0;
  if (answer === 'same') {
    const codesOf = (phone: Phone): string =>
      JSON.stringify(
        phone.state.incidents.flatMap((i) => i.entries.map((e) => [e.sighting.sightingId, e.code])),
      );
    const first = at(0);
    for (const phone of phones) {
      expect(phone.state.incidents, `${phone.firstId}: one Incident`).toHaveLength(1);
      const incident = phone.state.incidents[0];
      expect(incident?.incidentId, `${phone.firstId}: the smallest first id`).toBe(smallest);
      expect(phone.state.openIncidentId).toBe(smallest);
      expect(incident?.entries).toHaveLength(everySighting.length);
      expect(codesOf(phone), `${phone.firstId}: the same Sightings and codes`).toBe(codesOf(first));
      mostFormerIds = Math.max(mostFormerIds, incident?.formerIds.length ?? 0);
    }
  } else {
    for (const phone of phones) {
      expect(phone.state.incidents.map((i) => i.incidentId).sort()).toEqual([...firstIds].sort());
      for (const incident of phone.state.incidents) {
        expect(incident.formerIds, 'no join, no former id').toEqual([]);
        const maker = phones.find((p) => p.firstId === incident.incidentId);
        const madeFor = incident.entries.map((e) => e.sighting.sightingId).sort();
        const expected = (maker?.own ?? [])
          .map((n) => canonicalOf(n, incident.incidentId).sighting.sightingId)
          .sort();
        expect(
          madeFor,
          `${phone.firstId}: Incident ${incident.incidentId} holds only its own`,
        ).toEqual(expected);
      }
      expect(phone.questions).toBeGreaterThanOrEqual(0);
    }
  }
  const questions = phones.reduce((sum, p) => sum + p.questions, 0);
  tracker.record('phones', phones.length, '2 to 4');
  tracker.record('Sightings in a run', everySighting.length, '12');
  tracker.record('questions asked in a run', questions, 'none');
  tracker.record('former ids of one Incident', mostFormerIds, '16');
  return { phones: phones.length, sightings: everySighting.length, questions, mostFormerIds };
}

describe('P-4.10: two to four phones that start their own Incident (Req 4.10)', () => {
  it('converge to the smallest first id with the same Sightings when the answer is "the same smoke", and keep apart when it is "a different smoke"', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.10',
      fc.property(joinGroups, (group) => {
        run(group, tracker);
      }),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-4.10: examples of the premise and of the order', () => {
  const run1 = (group: Group) => run(group, new ErrorTracker());
  const LOW = 'C222222222';
  const MID = 'D4N8RTY5CM';
  const HIGH = 'K7PQ3MWXA2';

  it('two phones, each with one Sighting, no script: the final sends alone make them one smoke', () => {
    const reach = run1({ firstIds: [HIGH, LOW], counts: [1, 1], answer: 'same', script: [] });
    expect(reach.sightings).toBe(2);
    expect(reach.questions).toBeGreaterThanOrEqual(1);
  });

  it('three phones in the same run, the same answer, any order of the ids', () => {
    for (const ids of [
      [LOW, MID, HIGH],
      [HIGH, MID, LOW],
      [MID, HIGH, LOW],
    ]) {
      const reach = run1({ firstIds: ids, counts: [2, 1, 3], answer: 'same', script: [] });
      expect(reach.sightings).toBe(6);
    }
  });

  it('a code sent before the sender joined, and one after, both reach the others', () => {
    // The script: phone 0 sends Sighting 1 to phone 1 (1 mod 3 = 1 selects a send), phone 1 sends
    // to phone 0, they process, and the final sends follow with the ids they have by then.
    const reach = run1({
      firstIds: [HIGH, LOW, MID],
      counts: [2, 2, 2],
      answer: 'same',
      script: [1, 4 * 3 + 1, 2, 5, 8, 1 + 3 * 2, 2 + 3 * 2],
    });
    expect(reach.sightings).toBe(6);
  });

  it('the answer "a different smoke" at every question keeps one Incident per phone, none joined', () => {
    const reach = run1({
      firstIds: [LOW, MID, HIGH],
      counts: [1, 2, 1],
      answer: 'different',
      script: [],
    });
    expect(reach.sightings).toBe(4);
    expect(reach.mostFormerIds).toBe(0);
  });
});
