// Places at the tool boundary: `{ latDeg, lonDeg }` in degrees on the way in and out, Core's
// `{ latRad, lonRad }` inside (math-conventions: degrees only at an I/O boundary).

import { degToRad, radToDeg, type Position, type Result } from '@alidade/core';
import { child, finiteNumber, objectOf, type Checked } from '../check.ts';
import { own } from '../json-rpc.ts';

export interface Place {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export const PLACE_KEYS = ['latDeg', 'lonDeg'] as const;

/** Reads `{ latDeg, lonDeg }` from an argument, checking the type of each number. */
export function readPlace(value: unknown, field: string): Checked<Place> {
  const object = objectOf(value, field, PLACE_KEYS);
  if (!object.ok) return object;
  const latDeg = finiteNumber(own(object.value, 'latDeg'), child(field, 'latDeg'));
  if (!latDeg.ok) return latDeg;
  const lonDeg = finiteNumber(own(object.value, 'lonDeg'), child(field, 'lonDeg'));
  if (!lonDeg.ok) return lonDeg;
  return { ok: true, value: { latDeg: latDeg.value, lonDeg: lonDeg.value } };
}

/** The place as a Core position; a failure is Core's own. */
export function toPosition(place: Place): Result<Position> {
  const latRad = degToRad(place.latDeg);
  if (!latRad.ok) return latRad;
  const lonRad = degToRad(place.lonDeg);
  if (!lonRad.ok) return lonRad;
  return { ok: true, value: { latRad: latRad.value, lonRad: lonRad.value } };
}

/** The position as a place in degrees; a failure is Core's own. */
export function toPlace(position: Position): Result<Place> {
  const latDeg = radToDeg(position.latRad);
  if (!latDeg.ok) return latDeg;
  const lonDeg = radToDeg(position.lonRad);
  if (!lonDeg.ok) return lonDeg;
  return { ok: true, value: { latDeg: latDeg.value, lonDeg: lonDeg.value } };
}
