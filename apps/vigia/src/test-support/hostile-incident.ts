// Hostile inputs for the functions of the Incident store (P-2.6; test support, not exported).
// The domain of each generator is stated on it.

import type { Fix } from '@alidade/core';
import fc from 'fast-check';
import { assess, type Assessment } from '../math/assessment/assess';
import type { VigiaAction } from '../math/incident/apply-action';
import type {
  InboxItem,
  Incident,
  ShareChannel,
  VigiaState,
} from '../math/incident/incident-state';
import { encodeSighting } from '../math/code/sighting-code';
import { serialiseState } from '../math/incident/storage-format';
import type { VigiaParameters } from '../math/parameters';
import { fixCase, sightingArb, sightingSet, symbols, uniformInteger } from './generators';
import { hostileNumber, hostileString } from './hostile';
import { PARAMETERS } from './incident-fixtures';
import { INCIDENT_POOL, stateAfter, storageActions, type Step } from './storage-actions';

/**
 * A state the reducer really built: 0 to 60 steps of `storageActions`, the refused ones skipped.
 * Domain: every state the reducer can reach in 60 steps; at most 32 entries an Incident.
 */
export function reachedState(parameters: VigiaParameters = PARAMETERS): fc.Arbitrary<VigiaState> {
  return storageActions().map((steps: Step[]) => stateAfter(steps.slice(0, 60), parameters));
}

/**
 * A state with something wrong in it. Domain: a reached state with, in one draw in two, each of a
 * hostile double for an Incident's creation time, a hostile double for an entry's receive time, a
 * hostile string for an Incident id, an empty or hostile open Incident id, an entry's `hidden`
 * flipped, an entry's code replaced by a hostile string, an entry copied twice, and an entry
 * moved to another Incident, and a list of former ids with a hostile string, the Incident's own id
 * and a repeat in it. Numbers that are not finite occur.
 */
export function hostileState(): fc.Arbitrary<VigiaState> {
  return fc
    .tuple(
      reachedState(),
      fc.array(uniformInteger(0, 8), { maxLength: 4 }),
      hostileNumber(),
      hostileString(),
    )
    .map(([state, mutations, number, text]) => {
      let current = state;
      for (const mutation of mutations) {
        const incident = current.incidents[0];
        const entry = incident?.entries[0];
        if (incident === undefined) break;
        const replaceFirst = (change: Partial<typeof incident>): VigiaState => ({
          ...current,
          incidents: [{ ...incident, ...change }, ...current.incidents.slice(1)],
        });
        if (mutation === 0) current = replaceFirst({ createdUtcMs: number });
        else if (mutation === 1 && entry !== undefined) {
          current = replaceFirst({
            entries: [
              { ...entry, sighting: { ...entry.sighting, receivedUtcMs: number } },
              ...incident.entries.slice(1),
            ],
          });
        } else if (mutation === 2) current = replaceFirst({ incidentId: text });
        else if (mutation === 3) current = { ...current, openIncidentId: text };
        else if (mutation === 4 && entry !== undefined) {
          current = replaceFirst({
            entries: [{ ...entry, hidden: !entry.hidden }, ...incident.entries.slice(1)],
          });
        } else if (mutation === 5 && entry !== undefined) {
          current = replaceFirst({
            entries: [{ ...entry, code: text }, ...incident.entries.slice(1)],
          });
        } else if (mutation === 6 && entry !== undefined) {
          current = replaceFirst({ entries: [entry, ...incident.entries] });
        } else if (mutation === 8) {
          // A list of former ids with something wrong in it: a hostile string, the Incident's own
          // id, and the same id twice (design §7.4a, I8).
          current = replaceFirst({ formerIds: [text, incident.incidentId, text] });
        } else if (mutation === 7 && entry !== undefined && current.incidents.length > 1) {
          const other = current.incidents[1];
          if (other !== undefined) {
            current = {
              ...current,
              incidents: [
                { ...incident, entries: incident.entries.slice(1) },
                { ...other, entries: [...other.entries, entry] },
                ...current.incidents.slice(2),
              ],
            };
          }
        }
      }
      return current;
    });
}

const CHANNELS: readonly ShareChannel[] = ['link', 'qr', 'text', 'system_share', 'memory'];

/**
 * An Inbox item with hostile fields. Domain: a Sighting of `sightingArb` received, with its own
 * code (one draw in two), a code of 50 symbols that is not its (one in four) or a hostile string
 * (one in four), and a hostile arrival time.
 */
export function hostileItem(): fc.Arbitrary<InboxItem> {
  return fc
    .tuple(
      sightingArb(),
      fc.constantFrom('own', 'own', 'wrong', 'hostile'),
      symbols(50),
      hostileString(),
      hostileNumber(),
    )
    .map(([sighting, which, wrong, hostile, arrivedUtcMs]) => {
      const own = encodeSighting(sighting);
      const code = which === 'own' && own.ok ? own.value : which === 'wrong' ? wrong : hostile;
      return {
        sighting: { ...sighting, origin: 'received' as const, receivedUtcMs: null },
        code,
        arrivedUtcMs,
      };
    });
}

/**
 * An action with hostile fields. Domain: each kind of action; Incident ids from the pool, ten
 * symbols or a hostile string; times hostile doubles or the clock; Sighting ids hostile strings
 * or nine symbols; Sightings from `sightingArb` with their own code, a wrong code or a hostile
 * one; share records with a channel of the five and a hostile time; `replace` with a hostile state.
 */
export function hostileAction(): fc.Arbitrary<VigiaAction> {
  const incidentId = fc.oneof(fc.constantFrom(...INCIDENT_POOL), symbols(10), hostileString());
  const sightingId = fc.oneof(symbols(9), hostileString());
  const time = fc.oneof(hostileNumber(), fc.constant(1_790_000_000_000));
  /** A Sighting with its own code, a code of 50 symbols that is not its, or a hostile string. */
  const sightingWithCode = fc
    .tuple(
      sightingArb(),
      fc.constantFrom('own', 'own', 'wrong', 'hostile'),
      symbols(50),
      hostileString(),
    )
    .map(([sighting, which, wrong, hostile]) => {
      const own = encodeSighting(sighting);
      const code = which === 'own' && own.ok ? own.value : which === 'wrong' ? wrong : hostile;
      return { sighting, code };
    });
  const item: fc.Arbitrary<InboxItem> = fc
    .tuple(sightingWithCode, hostileNumber())
    .map(([{ sighting, code }, arrivedUtcMs]) => ({
      sighting: { ...sighting, origin: 'received' as const, receivedUtcMs: null },
      code,
      arrivedUtcMs,
    }));
  return fc.oneof(
    fc
      .tuple(incidentId, time)
      .map(([id, nowUtcMs]): VigiaAction => ({ kind: 'createIncident', incidentId: id, nowUtcMs })),
    incidentId.map((id): VigiaAction => ({ kind: 'openIncident', incidentId: id })),
    fc.tuple(sightingWithCode, time).map(([{ sighting, code }, nowUtcMs]): VigiaAction => ({
      kind: 'addLocal',
      sighting,
      code,
      nowUtcMs,
    })),
    fc.tuple(item, time).map(([i, nowUtcMs]): VigiaAction => ({
      kind: 'joinIncident',
      item: i,
      nowUtcMs,
    })),
    fc.tuple(item, time, fc.boolean()).map(([i, nowUtcMs, joinIfUnknown]): VigiaAction => ({
      kind: 'addReceived',
      item: i,
      nowUtcMs,
      joinIfUnknown,
    })),
    sightingId.map((id): VigiaAction => ({ kind: 'hide', sightingId: id })),
    sightingId.map((id): VigiaAction => ({ kind: 'show', sightingId: id })),
    sightingId.map((id): VigiaAction => ({ kind: 'deleteSighting', sightingId: id })),
    incidentId.map((id): VigiaAction => ({ kind: 'deleteIncident', incidentId: id })),
    fc.constant<VigiaAction>({ kind: 'deleteAll' }),
    fc
      .tuple(sightingId, fc.constantFrom(...CHANNELS), time)
      .map(([id, channel, atUtcMs]): VigiaAction => ({
        kind: 'markShared',
        sightingId: id,
        record: { channel, atUtcMs },
      })),
    time.map((nowUtcMs): VigiaAction => ({ kind: 'expire', nowUtcMs })),
    hostileState().map((state): VigiaAction => ({ kind: 'replace', state })),
  );
}

/**
 * A stored text. Domain: a hostile string (one draw in three); the text of `serialiseState` of a
 * reached state (one in three); and that text with 1 to 3 characters replaced by a hostile
 * character, or cut at a drawn place (one in three).
 */
export function hostileStoredText(): fc.Arbitrary<string> {
  const written = reachedState().map((state) => serialiseState(state, 1_790_000_000_000));
  const damaged = fc
    .tuple(
      written,
      fc.array(fc.tuple(uniformInteger(0, 100_000), hostileString()), {
        minLength: 1,
        maxLength: 3,
      }),
      fc.boolean(),
      uniformInteger(0, 100_000),
    )
    .map(([text, changes, cut, cutAt]) => {
      let out = text;
      for (const [at, replacement] of changes) {
        const place = out.length === 0 ? 0 : at % out.length;
        out = out.slice(0, place) + replacement.slice(0, 3) + out.slice(place + 1);
      }
      return cut && out.length > 0 ? out.slice(0, cutAt % out.length) : out;
    });
  return fc.oneof(hostileString(), written, damaged);
}

/**
 * An Incident for the assessment. Domain: the first Incident of a reached state (one draw in
 * three), an Incident of `sightingSet` (one in three), or the first Incident of a hostile state
 * (one in three), or an empty one when the state has none.
 */
export function hostileIncident(): fc.Arbitrary<Incident> {
  const empty: Incident = {
    incidentId: 'K7PQ3MWXA2',
    createdUtcMs: 1_790_000_000_000,
    creation: 'created',
    formerIds: [],
    entries: [],
    conflicts: [],
  };
  return fc.oneof(
    reachedState().map((state) => state.incidents[0] ?? empty),
    sightingSet().map((set) => set.incident),
    hostileState().map((state) => state.incidents[0] ?? empty),
  );
}

/**
 * A Fix with hostile numbers. Domain: a `fixCase` (one draw in two), or a Fix whose position,
 * Ellipse and covariance numbers are each a hostile double, with warnings of the two kinds and
 * 0 to 3 excluded ids that are hostile strings.
 */
export function hostileFix(): fc.Arbitrary<Fix> {
  const wild = fc
    .record({
      latRad: hostileNumber(),
      lonRad: hostileNumber(),
      semiMajorM: hostileNumber(),
      semiMinorM: hostileNumber(),
      azimuthRad: hostileNumber(),
      cov: hostileNumber(),
      warnings: fc.subarray(['poor_geometry', 'outliers_excluded'] as const),
      excludedIds: fc.array(hostileString(), { maxLength: 3 }),
    })
    .map((r): Fix => ({
      position: { latRad: r.latRad, lonRad: r.lonRad },
      covariance: { varEastM2: r.cov, varNorthM2: r.cov, covEastNorthM2: r.cov },
      ellipse: { semiMajorM: r.semiMajorM, semiMinorM: r.semiMinorM, azimuthRad: r.azimuthRad },
      residuals: [],
      iterations: 1,
      warnings: r.warnings,
      excludedIds: r.excludedIds,
    }));
  return fc.oneof(fixCase(), wild);
}

/**
 * An Assessment. Domain: `assess` of a `hostileIncident` at the time of the tests (when it
 * succeeds; else the empty assessment), with its Fix replaced, one draw in two, by a
 * `hostileFix` given as a success, a Core failure, or `null`.
 */
export function hostileAssessment(): fc.Arbitrary<Assessment> {
  const empty: Assessment = {
    used: [],
    setAside: [],
    fix: null,
    checkLevel: 'none',
    disagreement: 'none',
  };
  return fc
    .tuple(
      hostileIncident(),
      fc.oneof(
        fc.constant('keep' as const),
        hostileFix().map((fix) => ({ ok: true as const, value: fix })),
        fc.constant({ ok: false as const, reason: 'not_converged' as const }),
        fc.constant(null),
      ),
    )
    .map(([incident, replacement]) => {
      const a = assess(incident, 1_790_000_000_000, PARAMETERS);
      const base = a.ok ? a.value : empty;
      return replacement === 'keep' ? base : { ...base, fix: replacement };
    });
}
