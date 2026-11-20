// An arc of a Circle of equal altitude near the Fix (Req 9.4, 9.9; design §7.7).

import {
  destinationPosition,
  initialAzimuthRad,
  isSupportedPosition,
  type Position,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { EARTH_RADIUS_M } from './earth';

/** The most vertices on one side of the arc's centre: a guard against a step that is absurdly small. */
const MOST_STEPS_PER_SIDE = 100_000;

function finitePosition(p: Position): boolean {
  return Number.isFinite(p.latRad) && Number.isFinite(p.lonRad) && isSupportedPosition(p);
}

/**
 * The arc of the Circle of angular radius `radiusRad` around `centre` (the Subsolar point) that is
 * centred on the point of the Circle nearest `near` (the Fix), with vertices at most `stepRad`
 * apart along the Circle and reaching `halfLengthM` along it each way (at most half the Circle).
 * The arc is returned as segments: a segment ends where a vertex is not a Supported position,
 * where the longitude jumps across `±180°`, and before it would span more than 180° of longitude.
 * Fails with `invalid_number` naming the argument, `unsupported_position` for a centre or Fix
 * within 1° of a pole, and `coincident_positions` for a Fix at the centre.
 */
export function circleArc(
  centre: Position,
  radiusRad: number,
  near: Position,
  halfLengthM: number,
  stepRad: number,
): NoniusResult<readonly (readonly Position[])[]> {
  if (!(Number.isFinite(radiusRad) && radiusRad > 0 && radiusRad < Math.PI)) {
    return err('invalid_number', { field: 'radiusRad' });
  }
  if (!(Number.isFinite(halfLengthM) && halfLengthM > 0)) {
    return err('invalid_number', { field: 'halfLengthM' });
  }
  if (!(Number.isFinite(stepRad) && stepRad > 0))
    return err('invalid_number', { field: 'stepRad' });
  if (!finitePosition(centre)) return err('unsupported_position', { field: 'centre' });
  if (!finitePosition(near)) return err('unsupported_position', { field: 'near' });
  const sinRho = Math.sin(radiusRad);
  if (!(sinRho > 1e-9)) return err('invalid_number', { field: 'radiusRad' });
  const nearestAzimuthRad = initialAzimuthRad(centre, near);
  if (!nearestAzimuthRad.ok) return err(nearestAzimuthRad.reason, { field: 'near' });

  const halfAzimuthRad = Math.min(halfLengthM / (EARTH_RADIUS_M * sinRho), Math.PI);
  const steps = Math.min(
    MOST_STEPS_PER_SIDE,
    Math.max(1, Math.ceil((halfAzimuthRad * sinRho) / stepRad)),
  );
  const deltaRad = halfAzimuthRad / steps;

  const segments: Position[][] = [];
  let current: Position[] = [];
  let minLonRad = 0;
  let maxLonRad = 0;
  const flush = (): void => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  for (let j = -steps; j <= steps; j += 1) {
    const vertex = destinationPosition(
      centre,
      nearestAzimuthRad.value + j * deltaRad,
      radiusRad * EARTH_RADIUS_M,
    );
    if (!vertex.ok) return err(vertex.reason, { field: 'vertex' });
    const v = vertex.value;
    if (!isSupportedPosition(v)) {
      flush();
      continue;
    }
    const last = current[current.length - 1];
    if (last !== undefined && Math.abs(v.lonRad - last.lonRad) > Math.PI) {
      flush();
    } else if (
      last !== undefined &&
      Math.max(maxLonRad, v.lonRad) - Math.min(minLonRad, v.lonRad) > Math.PI
    ) {
      // Too wide for one segment: continue from the previous vertex.
      flush();
      current = [last];
      minLonRad = last.lonRad;
      maxLonRad = last.lonRad;
    }
    if (current.length === 0) {
      minLonRad = v.lonRad;
      maxLonRad = v.lonRad;
    }
    minLonRad = Math.min(minLonRad, v.lonRad);
    maxLonRad = Math.max(maxLonRad, v.lonRad);
    current.push(v);
  }
  flush();
  return ok(segments);
}
