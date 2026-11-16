// The Bearing observation, its validation and its versioned JSON wire format (Req 4).
//
// A bearing is one sighting of a target: who (id), from where (observer position and its
// 1-sigma accuracy in metres), when (UTC), in which direction (azimuth) and how precisely
// (1-sigma in radians). Inside the package angles are radians; the wire format carries degrees
// with `Deg` suffixes (math-conventions: degrees exist only at I/O boundaries).

import { degToRad, radToDeg, TWO_PI_RAD } from './angle';
import { isSupportedPosition, MAX_SUPPORTED_LAT_RAD, type Position } from './position';
import { err, ok, type Failure, type Result } from './result';

/** Smallest accepted azimuth 1-sigma: 0.01° (Req 4.2). Same expression as `degToRad`. */
export const MIN_AZIMUTH_SIGMA_RAD = 0.01 * (Math.PI / 180);
/** Largest accepted azimuth 1-sigma: 45° (Req 4.2). */
export const MAX_AZIMUTH_SIGMA_RAD = 45 * (Math.PI / 180);
/** Largest accepted observer position accuracy: 10 000 m (Req 4.2). */
export const MAX_POSITION_ACCURACY_M = 10_000;

export interface Bearing {
  /** Non-empty. Unique among the observations given to one solve. */
  readonly id: string;
  /** Where the observer stood: a Supported position. */
  readonly observer: Position;
  /** 1-sigma accuracy of the observer's position, in metres, in [0, 10 000]. */
  readonly positionAccuracyM: number;
  /** Time of the sighting, milliseconds since the Unix epoch, UTC. */
  readonly timeUtcMs: number;
  /** Direction of the target, clockwise from true north, in [0, 2π). */
  readonly azimuthRad: number;
  /** 1-sigma of the azimuth, in radians, in [0.01°, 45°]. */
  readonly azimuthSigmaRad: number;
}

/** The JSON wire format of a Bearing, version 1 (Req 4.4). */
export interface BearingWire {
  readonly v: 1;
  readonly kind: 'bearing';
  readonly id: string;
  readonly observer: { readonly latDeg: number; readonly lonDeg: number };
  readonly positionAccuracyM: number;
  readonly timeUtcMs: number;
  readonly azimuthDeg: number;
  readonly azimuthSigmaDeg: number;
}

/** A failure for `field` of the bearing `id` (the id is named only when it is a usable string). */
function invalidField(id: unknown, field: string): Failure {
  return typeof id === 'string' && id.length > 0
    ? err('invalid_observation', { field, id })
    : err('invalid_observation', { field });
}

/**
 * Validates a Bearing (Req 4.2). Checks run in this order and the first failure is returned as
 * `invalid_observation`, naming the observation `id` and the offending `field` (Req 4.3, 9.9):
 * the id is a non-empty string; every number is finite; the observer is a Supported position;
 * the azimuth is in [0, 2π); the azimuth 1-sigma is in [0.01°, 45°]; the position accuracy is
 * in [0 m, 10 000 m].
 */
export function validateBearing(bearing: Bearing): Result<void> {
  if (typeof bearing.id !== 'string' || bearing.id.length === 0) {
    return invalidField(bearing.id, 'id');
  }
  const numbers: readonly (readonly [string, number])[] = [
    ['observer.latRad', bearing.observer.latRad],
    ['observer.lonRad', bearing.observer.lonRad],
    ['positionAccuracyM', bearing.positionAccuracyM],
    ['timeUtcMs', bearing.timeUtcMs],
    ['azimuthRad', bearing.azimuthRad],
    ['azimuthSigmaRad', bearing.azimuthSigmaRad],
  ];
  for (const [field, value] of numbers) {
    if (!Number.isFinite(value)) return invalidField(bearing.id, field);
  }
  if (!isSupportedPosition(bearing.observer)) {
    // Finite, so the latitude or the longitude is out of range; name the one that is.
    const latitudeOk = Math.abs(bearing.observer.latRad) <= MAX_SUPPORTED_LAT_RAD;
    return invalidField(bearing.id, latitudeOk ? 'observer.lonRad' : 'observer.latRad');
  }
  if (!(bearing.azimuthRad >= 0 && bearing.azimuthRad < TWO_PI_RAD)) {
    return invalidField(bearing.id, 'azimuthRad');
  }
  if (!(
    bearing.azimuthSigmaRad >= MIN_AZIMUTH_SIGMA_RAD &&
    bearing.azimuthSigmaRad <= MAX_AZIMUTH_SIGMA_RAD
  )) {
    return invalidField(bearing.id, 'azimuthSigmaRad');
  }
  if (!(bearing.positionAccuracyM >= 0 && bearing.positionAccuracyM <= MAX_POSITION_ACCURACY_M)) {
    return invalidField(bearing.id, 'positionAccuracyM');
  }
  return ok(undefined);
}

/** `radToDeg` for a validated angle, reported as `invalid_observation` for `field` if it fails. */
function toDegrees(bearing: Bearing, angleRad: number, field: string): Result<number> {
  const angleDeg = radToDeg(angleRad);
  return angleDeg.ok ? angleDeg : invalidField(bearing.id, field);
}

/**
 * Serialises a Bearing to the wire format (Req 4.4): `v: 1`, `kind: "bearing"`, angles in degrees
 * with `Deg` suffixes and the time as `timeUtcMs`. The bearing is validated first, so a bearing
 * with a non-finite number fails with `invalid_observation` and never produces a wire object
 * with a NaN or an infinity in it (design D17).
 */
export function serialiseBearing(bearing: Bearing): Result<BearingWire> {
  const validation = validateBearing(bearing);
  if (!validation.ok) return validation;

  const latDeg = toDegrees(bearing, bearing.observer.latRad, 'observer.latRad');
  if (!latDeg.ok) return latDeg;
  const lonDeg = toDegrees(bearing, bearing.observer.lonRad, 'observer.lonRad');
  if (!lonDeg.ok) return lonDeg;
  const azimuthDeg = toDegrees(bearing, bearing.azimuthRad, 'azimuthRad');
  if (!azimuthDeg.ok) return azimuthDeg;
  const azimuthSigmaDeg = toDegrees(bearing, bearing.azimuthSigmaRad, 'azimuthSigmaRad');
  if (!azimuthSigmaDeg.ok) return azimuthSigmaDeg;

  return ok({
    v: 1,
    kind: 'bearing',
    id: bearing.id,
    observer: { latDeg: latDeg.value, lonDeg: lonDeg.value },
    positionAccuracyM: bearing.positionAccuracyM,
    timeUtcMs: bearing.timeUtcMs,
    azimuthDeg: azimuthDeg.value,
    azimuthSigmaDeg: azimuthSigmaDeg.value,
  });
}

/** Maps the field names `validateBearing` reports to the names used on the wire. */
const WIRE_FIELD_NAMES: Readonly<Record<string, string>> = {
  'observer.latRad': 'observer.latDeg',
  'observer.lonRad': 'observer.lonDeg',
  azimuthRad: 'azimuthDeg',
  azimuthSigmaRad: 'azimuthSigmaDeg',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses the wire format into a Bearing (Req 4.5) and applies the same validation.
 *
 * - Not an object: `invalid_observation`.
 * - `v` missing or not `1`, or `kind` missing or not `"bearing"`: `unsupported_format`, naming
 *   `v` or `kind` (Req 4.7). A missing `v` or `kind` is a format that cannot be identified,
 *   which is why it is not `invalid_observation` as for the other missing fields.
 * - A required field missing or of the wrong type: `invalid_observation` naming the field
 *   (Req 4.8). Unknown extra fields are ignored.
 * - Then the angles are converted to radians and `validateBearing` runs; its failure names the
 *   wire field.
 *
 * It never throws.
 */
export function parseBearing(wire: unknown): Result<Bearing> {
  if (!isRecord(wire)) return err('invalid_observation');
  const wireId = wire['id'];

  if (wire['v'] !== 1) return err('unsupported_format', { field: 'v' });
  if (wire['kind'] !== 'bearing') return err('unsupported_format', { field: 'kind' });

  const observer = wire['observer'];
  if (!isRecord(observer)) return invalidField(wireId, 'observer');
  const fields: readonly (readonly [string, unknown, 'string' | 'number'])[] = [
    ['id', wire['id'], 'string'],
    ['observer.latDeg', observer['latDeg'], 'number'],
    ['observer.lonDeg', observer['lonDeg'], 'number'],
    ['positionAccuracyM', wire['positionAccuracyM'], 'number'],
    ['timeUtcMs', wire['timeUtcMs'], 'number'],
    ['azimuthDeg', wire['azimuthDeg'], 'number'],
    ['azimuthSigmaDeg', wire['azimuthSigmaDeg'], 'number'],
  ];
  for (const [field, value, expectedType] of fields) {
    if (typeof value !== expectedType) return invalidField(wireId, field);
  }

  const angles = {
    latRad: degToRad(observer['latDeg'] as number),
    lonRad: degToRad(observer['lonDeg'] as number),
    azimuthRad: degToRad(wire['azimuthDeg'] as number),
    azimuthSigmaRad: degToRad(wire['azimuthSigmaDeg'] as number),
  };
  if (!angles.latRad.ok) return invalidField(wireId, 'observer.latDeg');
  if (!angles.lonRad.ok) return invalidField(wireId, 'observer.lonDeg');
  if (!angles.azimuthRad.ok) return invalidField(wireId, 'azimuthDeg');
  if (!angles.azimuthSigmaRad.ok) return invalidField(wireId, 'azimuthSigmaDeg');

  const bearing: Bearing = {
    id: wire['id'] as string,
    observer: { latRad: angles.latRad.value, lonRad: angles.lonRad.value },
    positionAccuracyM: wire['positionAccuracyM'] as number,
    timeUtcMs: wire['timeUtcMs'] as number,
    azimuthRad: angles.azimuthRad.value,
    azimuthSigmaRad: angles.azimuthSigmaRad.value,
  };
  const validation = validateBearing(bearing);
  if (!validation.ok) {
    const wireField =
      validation.field === undefined ? undefined : WIRE_FIELD_NAMES[validation.field];
    return wireField === undefined ? validation : { ...validation, field: wireField };
  }
  return ok(bearing);
}
