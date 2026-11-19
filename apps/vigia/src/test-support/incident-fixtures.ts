// Synthetic Sightings for the tests of the Incident, the assessment and the words (test support,
// not exported). Every position is the origin `30° N, 40° W` moved by an offset in metres (Req
// 17.8). A Sighting built here is canonical: it has been through `canonicalise`, so its code is
// the one every phone holds.

import { destinationPosition, type Bearing, type Position } from '@alidade/core';
import { symbolAt } from '../math/code/alphabet';
import { canonicalise, type Sighting } from '../math/incident/sighting';
import { defaultParameters, type VigiaParameters } from '../math/parameters';

export const PARAMETERS: VigiaParameters = defaultParameters();

/** The synthetic origin: 30° N, 40° W, in the open Atlantic (UI's catalogue origin). */
export const ORIGIN: Position = { latRad: (30 * Math.PI) / 180, lonRad: (-40 * Math.PI) / 180 };

/** A time inside the code's 20 years: 2026-09-21T14:13:20Z. */
export const NOW_UTC_MS = 1_790_000_000_000;

/** An Incident id of ten symbols that is the same for every test, in `device` mode. */
export const INCIDENT_ID = 'K7PQ3MWXA2';
/** An Incident id made in Simulation mode (first symbol Z). */
export const SIMULATION_INCIDENT_ID = 'ZB4N8RTY5C';

/** A Sighting id of nine symbols from a number: distinct numbers give distinct ids. */
export function sightingIdOf(n: number): string {
  let rest = n;
  let id = '';
  for (let i = 0; i < 9; i += 1) {
    id = (symbolAt(rest % 31) ?? '2') + id;
    rest = Math.floor(rest / 31);
  }
  return id;
}

/** The Position `eastM`, `northM` metres from the origin (by Core's destination formula). */
export function offsetFromOrigin(eastM: number, northM: number): Position {
  const distanceM = Math.hypot(eastM, northM);
  if (distanceM === 0) return ORIGIN;
  const azimuthRad = Math.atan2(eastM, northM);
  const result = destinationPosition(ORIGIN, azimuthRad, distanceM);
  if (!result.ok) throw new Error('destinationPosition failed');
  return result.value;
}

/** A valid Bearing, with its fields overridable. */
export function bearingOf(n: number, change: Partial<Bearing> = {}): Bearing {
  return {
    id: sightingIdOf(n),
    observer: offsetFromOrigin(100 * n, -50 * n),
    positionAccuracyM: 8,
    timeUtcMs: NOW_UTC_MS - 60_000 * n,
    azimuthRad: 0.5 + 0.01 * n,
    azimuthSigmaRad: 0.035,
    ...change,
  };
}

/** The canonical Sighting and its code. `origin` is local (no receive time) unless stated. */
export function canonicalOf(
  n: number,
  incidentId = INCIDENT_ID,
  change: Partial<Bearing> = {},
  origin: 'local' | 'received' = 'local',
  receivedUtcMs: number | null = null,
): { readonly sighting: Sighting; readonly code: string } {
  const sighting: Sighting = {
    sightingId: sightingIdOf(n),
    incidentId,
    bearing: bearingOf(n, change),
    origin,
    receivedUtcMs: origin === 'local' ? null : (receivedUtcMs ?? NOW_UTC_MS),
  };
  const result = canonicalise(sighting, PARAMETERS);
  if (!result.ok) throw new Error(`canonicalise failed: ${result.reason} ${result.field ?? ''}`);
  return result.value;
}
