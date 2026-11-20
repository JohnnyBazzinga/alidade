import { describe, expect, it } from 'vitest';
import {
  canonicalOf,
  INCIDENT_ID,
  NOW_UTC_MS,
  PARAMETERS,
  sightingIdOf,
} from '../../test-support/incident-fixtures';
import type { Incident, SightingEntry } from './incident-state';
import { mergeSighting } from './merge';

const EMPTY: Incident = {
  incidentId: INCIDENT_ID,
  createdUtcMs: NOW_UTC_MS,
  creation: 'created',
  formerIds: [],
  entries: [],
  conflicts: [],
};

function merged(
  incident: Incident,
  n: number,
  origin: 'local' | 'received' = 'local',
  receivedUtcMs: number | null = null,
  parameters = PARAMETERS,
) {
  const { sighting, code } = canonicalOf(n);
  return mergeSighting(incident, { ...sighting, origin }, code, receivedUtcMs, parameters);
}

function mergedOk(incident: Incident, n: number, origin: 'local' | 'received' = 'local') {
  const result = merged(incident, n, origin, origin === 'received' ? NOW_UTC_MS + 5 : null);
  if (!result.ok) throw new Error(`merge failed: ${result.reason}`);
  return result.value;
}

describe('mergeSighting: added (Req 9.5, design §7.4)', () => {
  it('adds a new Sighting as an entry that is not hidden and has not been shared', () => {
    const { incident, outcome, notices } = mergedOk(EMPTY, 1);
    expect(outcome).toBe('added');
    expect(notices).toEqual([]);
    expect(incident.entries).toHaveLength(1);
    const entry = incident.entries[0] as SightingEntry;
    const { sighting, code } = canonicalOf(1);
    expect(entry).toEqual({ sighting, code, hidden: false, shared: [] });
    expect(entry.sighting.origin).toBe('local');
    expect(entry.sighting.receivedUtcMs).toBeNull();
  });

  it('stamps a received Sighting with origin received and the receive time it is given', () => {
    const { incident } = mergedOk(EMPTY, 1, 'received');
    expect(incident.entries[0]?.sighting.origin).toBe('received');
    expect(incident.entries[0]?.sighting.receivedUtcMs).toBe(NOW_UTC_MS + 5);
    expect(incident.entries[0]?.sighting.bearing).toEqual(canonicalOf(1).sighting.bearing);
  });

  it('keeps the entries ordered by sightingId, whatever the order of arrival', () => {
    const order = [5, 2, 9, 1, 7];
    let incident = EMPTY;
    for (const n of order) incident = mergedOk(incident, n).incident;
    const ids = incident.entries.map((e) => e.sighting.sightingId);
    expect(ids).toEqual(order.map(sightingIdOf).sort());
    let reversed = EMPTY;
    for (const n of [...order].reverse()) reversed = mergedOk(reversed, n).incident;
    expect(reversed).toEqual(incident);
  });

  it('does not change the Incident it was given', () => {
    const before = JSON.stringify(EMPTY);
    mergedOk(EMPTY, 1);
    expect(JSON.stringify(EMPTY)).toBe(before);
  });
});

describe('mergeSighting: duplicate (Req 9.5)', () => {
  it('returns the same Incident object, so nothing of the held entry is touched', () => {
    const first = mergedOk(EMPTY, 1).incident;
    // The held entry is hidden and has been shared, and was received at an earlier time.
    const held: SightingEntry = {
      ...(first.entries[0] as SightingEntry),
      hidden: true,
      shared: [{ channel: 'link', atUtcMs: NOW_UTC_MS + 1 }],
    };
    const incident: Incident = { ...first, entries: [held] };
    const again = merged(incident, 1, 'received', NOW_UTC_MS + 99_000);
    expect(again.ok && again.value.incident).toBe(incident);
    expect(again.ok && again.value.outcome).toBe('duplicate');
    expect(again.ok && again.value.notices).toEqual([]);
    expect(incident.entries[0]?.hidden).toBe(true);
    expect(incident.entries[0]?.sighting.receivedUtcMs).toBeNull();
  });

  it('is a duplicate even when the Incident is full', () => {
    let incident = EMPTY;
    for (let n = 1; n <= PARAMETERS.maxSightingsPerIncident; n += 1)
      incident = mergedOk(incident, n).incident;
    const again = merged(incident, 3);
    expect(again.ok && again.value.outcome).toBe('duplicate');
    expect(again.ok && again.value.incident).toBe(incident);
  });
});

describe('mergeSighting: conflict (Req 9.5)', () => {
  /** The same Sighting id with another azimuth: a different code. */
  const other = (n: number) => canonicalOf(n, INCIDENT_ID, { azimuthRad: 2.5 });

  it('keeps the held entry, records both codes and says sighting_conflict', () => {
    const held = mergedOk(EMPTY, 1).incident;
    const { sighting, code } = other(1);
    expect(code).not.toBe(canonicalOf(1).code);
    const result = mergeSighting(
      held,
      { ...sighting, origin: 'received' },
      code,
      NOW_UTC_MS + 7,
      PARAMETERS,
    );
    if (!result.ok) throw new Error('failed');
    expect(result.value.outcome).toBe('conflict');
    expect(result.value.notices).toEqual([{ reason: 'sighting_conflict', id: sightingIdOf(1) }]);
    expect(result.value.incident.entries).toEqual(held.entries);
    expect(result.value.incident.conflicts).toEqual([
      { sightingId: sightingIdOf(1), heldCode: canonicalOf(1).code, otherCode: code },
    ]);
  });

  it('records the same conflict once, however often the other code arrives', () => {
    const held = mergedOk(EMPTY, 1).incident;
    const { sighting, code } = other(1);
    const once = mergeSighting(held, { ...sighting, origin: 'received' }, code, 1, PARAMETERS);
    if (!once.ok) throw new Error('failed');
    const twice = mergeSighting(
      once.value.incident,
      { ...sighting, origin: 'received' },
      code,
      2,
      PARAMETERS,
    );
    expect(twice.ok && twice.value.incident.conflicts).toHaveLength(1);
    expect(twice.ok && twice.value.incident).toBe(once.value.incident);
  });

  it('records a second conflict for a third code of the same id', () => {
    const held = mergedOk(EMPTY, 1).incident;
    const a = other(1);
    const b = canonicalOf(1, INCIDENT_ID, { azimuthRad: 3.5 });
    const first = mergeSighting(held, { ...a.sighting, origin: 'received' }, a.code, 1, PARAMETERS);
    if (!first.ok) throw new Error('failed');
    const second = mergeSighting(
      first.value.incident,
      { ...b.sighting, origin: 'received' },
      b.code,
      2,
      PARAMETERS,
    );
    expect(second.ok && second.value.incident.conflicts.map((c) => c.otherCode)).toEqual([
      a.code,
      b.code,
    ]);
  });

  it('is a conflict, not incident_full, when the Incident is full', () => {
    let incident = EMPTY;
    for (let n = 1; n <= PARAMETERS.maxSightingsPerIncident; n += 1)
      incident = mergedOk(incident, n).incident;
    const { sighting, code } = other(2);
    const result = mergeSighting(
      incident,
      { ...sighting, origin: 'received' },
      code,
      1,
      PARAMETERS,
    );
    expect(result.ok && result.value.outcome).toBe('conflict');
  });
});

describe('mergeSighting: full (Req 4.6)', () => {
  it('holds 32 Sightings and refuses the 33rd with incident_full, whatever the order', () => {
    let incident = EMPTY;
    for (let n = 1; n <= 32; n += 1) {
      const result = mergedOk(incident, n);
      expect(result.outcome).toBe('added');
      incident = result.incident;
    }
    expect(incident.entries).toHaveLength(32);
    expect(merged(incident, 33)).toEqual({ ok: false, reason: 'incident_full' });
    expect(merged(incident, 0)).toEqual({ ok: false, reason: 'incident_full' });
  });

  it('takes the limit from the parameters', () => {
    const small = { ...PARAMETERS, maxSightingsPerIncident: 2 };
    const one = merged(EMPTY, 1, 'local', null, small);
    const two = one.ok ? merged(one.value.incident, 2, 'local', null, small) : one;
    expect(two.ok).toBe(true);
    expect(two.ok && merged(two.value.incident, 3, 'local', null, small)).toEqual({
      ok: false,
      reason: 'incident_full',
    });
  });
});

describe('mergeSighting: what it refuses', () => {
  it('refuses a Sighting of another Incident with invalid_number naming incidentId', () => {
    const { sighting, code } = canonicalOf(1, 'C222222222');
    expect(mergeSighting(EMPTY, sighting, code, null, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentId',
    });
  });

  it('refuses a code that is not the code of the Sighting, naming code', () => {
    const { sighting } = canonicalOf(1);
    const wrong = canonicalOf(2).code;
    expect(mergeSighting(EMPTY, sighting, wrong, null, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'code',
    });
    expect(mergeSighting(EMPTY, sighting, 'nonsense', null, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'code',
    });
  });

  it('stores what the code decodes to even when the Sighting given carries unrounded numbers', () => {
    const { sighting, code } = canonicalOf(1);
    const unrounded = {
      ...sighting,
      bearing: { ...sighting.bearing, timeUtcMs: sighting.bearing.timeUtcMs - 1500 },
    };
    // The unrounded Sighting encodes to a different code than `code`: refused, so that the entry
    // is always the canonical one (I5).
    const result = mergeSighting(EMPTY, unrounded, code, null, PARAMETERS);
    expect(result.ok || result.field).toBe('code');
  });

  it('refuses a receive time that is not finite for a received Sighting, naming receivedUtcMs', () => {
    const { sighting, code } = canonicalOf(1);
    for (const bad of [Number.NaN, Infinity, null]) {
      expect(
        mergeSighting(EMPTY, { ...sighting, origin: 'received' }, code, bad, PARAMETERS),
      ).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'receivedUtcMs',
      });
    }
  });

  it('names the parameter that is not valid', () => {
    const { sighting, code } = canonicalOf(1);
    expect(
      mergeSighting(EMPTY, sighting, code, null, { ...PARAMETERS, maxCodeLengthChars: -1 }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'maxCodeLengthChars' });
  });
});
