// `fix_from_bearings`: observers' positions and true bearings with their sigmas to Core's Fix, with
// the 95 % ellipse in metres and its warnings, or the failure's reason and words (Req 6.1).

import {
  BearingModel,
  CONFIDENCE_95_SCALE,
  ellipse95,
  parseBearing,
  radToDeg,
  solve,
  type BearingWire,
  type Ellipse,
  type Result,
} from '@alidade/core';
import { array, boolean, boundedString, child, finiteNumber, objectOf } from '../check.ts';
import { hasOwn, own } from '../json-rpc.ts';
import { failure, finiteOrFailure, type Outcome } from '../outcome.ts';
import type { ToolDefinition } from '../tool-definition.ts';
import { readPlace } from './places.ts';

export const MIN_BEARINGS = 2;
export const MAX_BEARINGS = 64;
export const MAX_ID_LENGTH = 128;

const TOP_KEYS = ['bearings', 'outlierRejection'];
const BEARING_KEYS = [
  'id',
  'observer',
  'positionAccuracyM',
  'timeUtcMs',
  'azimuthDeg',
  'azimuthSigmaDeg',
];

/** Reads one bearing into the wire format that Core's `parseBearing` validates. */
function readBearing(
  value: unknown,
  field: string,
):
  | { readonly ok: true; readonly wire: BearingWire }
  | { readonly ok: false; readonly field: string } {
  const object = objectOf(value, field, BEARING_KEYS);
  if (!object.ok) return object;
  const id = boundedString(own(object.value, 'id'), child(field, 'id'), 1, MAX_ID_LENGTH);
  if (!id.ok) return id;
  const observer = readPlace(own(object.value, 'observer'), child(field, 'observer'));
  if (!observer.ok) return observer;
  const numbers: Record<string, number> = {};
  for (const key of ['positionAccuracyM', 'timeUtcMs', 'azimuthDeg', 'azimuthSigmaDeg']) {
    const number = finiteNumber(own(object.value, key), child(field, key));
    if (!number.ok) return number;
    numbers[key] = number.value;
  }
  return {
    ok: true,
    wire: {
      v: 1,
      kind: 'bearing',
      id: id.value,
      observer: observer.value,
      positionAccuracyM: numbers['positionAccuracyM'] ?? 0,
      timeUtcMs: numbers['timeUtcMs'] ?? 0,
      azimuthDeg: numbers['azimuthDeg'] ?? 0,
      azimuthSigmaDeg: numbers['azimuthSigmaDeg'] ?? 0,
    },
  };
}

function degreesOf(values: readonly number[]): Result<number[]> {
  const out: number[] = [];
  for (const value of values) {
    const degrees = radToDeg(value);
    if (!degrees.ok) return degrees;
    out.push(degrees.value);
  }
  return { ok: true, value: out };
}

function ellipseOutcome(
  ellipse: Ellipse,
): Result<{ semiMajorM: number; semiMinorM: number; azimuthDeg: number }> {
  const azimuth = degreesOf([ellipse.azimuthRad]);
  if (!azimuth.ok) return azimuth;
  return {
    ok: true,
    value: {
      semiMajorM: ellipse.semiMajorM,
      semiMinorM: ellipse.semiMinorM,
      azimuthDeg: azimuth.value[0] ?? 0,
    },
  };
}

export function runFixFromBearings(args: unknown): Outcome {
  const top = objectOf(args, '', TOP_KEYS);
  if (!top.ok) return failure('invalid_arguments', { field: top.field });
  const list = array(own(top.value, 'bearings'), 'bearings', MIN_BEARINGS, MAX_BEARINGS);
  if (!list.ok) return failure('invalid_arguments', { field: list.field });
  let outlierRejection = false;
  if (hasOwn(top.value, 'outlierRejection')) {
    const flag = boolean(own(top.value, 'outlierRejection'), 'outlierRejection');
    if (!flag.ok) return failure('invalid_arguments', { field: flag.field });
    outlierRejection = flag.value;
  }

  const bearings = [];
  for (let i = 0; i < list.value.length; i++) {
    const wire = readBearing(list.value[i], `bearings[${i}]`);
    if (!wire.ok) return failure('invalid_arguments', { field: wire.field });
    const parsed = parseBearing(wire.wire);
    if (!parsed.ok) return failure(parsed.reason, { field: parsed.field, id: parsed.id });
    bearings.push(parsed.value);
  }

  const solved = solve(new BearingModel(), bearings, { outlierRejection });
  if (!solved.ok) return failure(solved.reason, { field: solved.field, id: solved.id });
  const fix = solved.value;

  const wide = ellipse95(fix.ellipse);
  if (!wide.ok) return failure(wide.reason, { field: wide.field });
  const narrow = ellipseOutcome(fix.ellipse);
  if (!narrow.ok) return failure(narrow.reason);
  const ninetyFive = ellipseOutcome(wide.value);
  if (!ninetyFive.ok) return failure(ninetyFive.reason);
  const position = degreesOf([fix.position.latRad, fix.position.lonRad]);
  if (!position.ok) return failure(position.reason);

  const residuals = [];
  for (const residual of fix.residuals) {
    const degrees = degreesOf([residual.residualRad]);
    if (!degrees.ok) return failure(degrees.reason);
    residuals.push({
      id: residual.id,
      residualDeg: degrees.value[0] ?? 0,
      normalisedResidual: residual.normalisedResidual,
      studentisedResidual: residual.studentisedResidual,
    });
  }

  return finiteOrFailure({
    ok: true,
    position: { latDeg: position.value[0] ?? 0, lonDeg: position.value[1] ?? 0 },
    covarianceEnM2: {
      varEastM2: fix.covariance.varEastM2,
      varNorthM2: fix.covariance.varNorthM2,
      covEastNorthM2: fix.covariance.covEastNorthM2,
    },
    ellipse1Sigma: narrow.value,
    ellipse95: ninetyFive.value,
    ellipse95Scale: CONFIDENCE_95_SCALE,
    warnings: [...fix.warnings],
    excludedIds: [...fix.excludedIds],
    residuals,
    iterations: fix.iterations,
  });
}

const PLACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['latDeg', 'lonDeg'],
  properties: {
    latDeg: { type: 'number', description: 'Latitude in degrees, north positive.' },
    lonDeg: { type: 'number', description: 'Longitude in degrees, east positive.' },
  },
} as const;

export const FIX_FROM_BEARINGS: ToolDefinition = {
  name: 'fix_from_bearings',
  description:
    'Locates one target from the bearings of several observers at known positions (a smoke column seen from several posts). ' +
    'Each bearing is a TRUE azimuth in degrees, clockwise from true north, with its 1-sigma in degrees. ' +
    'Returns the position, the covariance in metres squared, the 1-sigma and the 95 % error ellipses in metres, ' +
    'the warnings, the excluded bearings and the residuals; or the reason the fix failed, in words. ' +
    'Uses Alidade’s own solver on a spherical Earth; 2 to 64 bearings.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['bearings'],
    properties: {
      bearings: {
        type: 'array',
        minItems: MIN_BEARINGS,
        maxItems: MAX_BEARINGS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: BEARING_KEYS,
          properties: {
            id: {
              type: 'string',
              minLength: 1,
              maxLength: MAX_ID_LENGTH,
              description: 'A name for this bearing, unique in the call.',
            },
            observer: { ...PLACE_SCHEMA, description: 'Where the observer stood.' },
            positionAccuracyM: {
              type: 'number',
              minimum: 0,
              maximum: 10000,
              description: '1-sigma accuracy of the observer’s position, in metres.',
            },
            timeUtcMs: {
              type: 'number',
              description: 'Time of the sighting, milliseconds since the Unix epoch, UTC.',
            },
            azimuthDeg: {
              type: 'number',
              minimum: 0,
              exclusiveMaximum: 360,
              description: 'Direction of the target, degrees clockwise from TRUE north.',
            },
            azimuthSigmaDeg: {
              type: 'number',
              minimum: 0.01,
              maximum: 45,
              description: '1-sigma of the azimuth, in degrees.',
            },
          },
        },
      },
      outlierRejection: {
        type: 'boolean',
        description: 'Exclude bearings that disagree with the others. Default false.',
      },
    },
  },
  handler: runFixFromBearings,
};
