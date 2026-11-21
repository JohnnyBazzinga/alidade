// `local_offset`: Core's Local plane. Two positions to east and north metres, and the inverse
// (Req 6.3).

import { projectToLocalPlane, unprojectToLocalPlane } from '@alidade/core';
import { finiteNumber, objectOf } from '../check.ts';
import { hasOwn, own } from '../json-rpc.ts';
import { failure, finiteOrFailure, type Outcome } from '../outcome.ts';
import type { ToolDefinition } from '../tool-definition.ts';
import { readPlace, toPlace, toPosition } from './places.ts';

const ALL_KEYS = ['direction', 'origin', 'position', 'eastM', 'northM'];

/**
 * The largest east or north offset accepted, in metres: half the circumference of Core's sphere
 * (π · 6 371 008.8 m = 20 015 086.8 m), rounded up. Beyond it Core wraps the offset around the
 * sphere and returns a finite but meaningless position (found by the hostile-input test).
 */
export const MAX_OFFSET_M = 20_015_087;

export function runLocalOffset(args: unknown): Outcome {
  const object = objectOf(args, '', ALL_KEYS);
  if (!object.ok) return failure('invalid_arguments', { field: object.field });
  const direction = own(object.value, 'direction');
  if (direction !== 'to_offset' && direction !== 'to_position') {
    return failure('invalid_arguments', { field: 'direction' });
  }
  const originPlace = readPlace(own(object.value, 'origin'), 'origin');
  if (!originPlace.ok) return failure('invalid_arguments', { field: originPlace.field });
  const origin = toPosition(originPlace.value);
  if (!origin.ok) return failure(origin.reason);

  if (direction === 'to_offset') {
    for (const key of ['eastM', 'northM']) {
      if (hasOwn(object.value, key)) return failure('invalid_arguments', { field: key });
    }
    const place = readPlace(own(object.value, 'position'), 'position');
    if (!place.ok) return failure('invalid_arguments', { field: place.field });
    const position = toPosition(place.value);
    if (!position.ok) return failure(position.reason);
    const point = projectToLocalPlane(origin.value, position.value);
    if (!point.ok) return failure(point.reason);
    return finiteOrFailure({ ok: true, eastM: point.value.eastM, northM: point.value.northM });
  }

  if (hasOwn(object.value, 'position')) return failure('invalid_arguments', { field: 'position' });
  const eastM = finiteNumber(own(object.value, 'eastM'), 'eastM');
  if (!eastM.ok || Math.abs(eastM.value) > MAX_OFFSET_M) {
    return failure('invalid_arguments', { field: 'eastM' });
  }
  const northM = finiteNumber(own(object.value, 'northM'), 'northM');
  if (!northM.ok || Math.abs(northM.value) > MAX_OFFSET_M) {
    return failure('invalid_arguments', { field: 'northM' });
  }
  const position = unprojectToLocalPlane(origin.value, {
    eastM: eastM.value,
    northM: northM.value,
  });
  if (!position.ok) return failure(position.reason);
  const place = toPlace(position.value);
  if (!place.ok) return failure(place.reason);
  return finiteOrFailure({
    ok: true,
    position: { latDeg: place.value.latDeg, lonDeg: place.value.lonDeg },
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

export const LOCAL_OFFSET: ToolDefinition = {
  name: 'local_offset',
  description:
    'Converts between positions and metres on a local plane (East-North, tangent at an origin, spherical Earth). ' +
    'direction "to_offset": give origin and position, get eastM and northM. ' +
    'direction "to_position": give origin, eastM and northM, get the position. Intended for short distances.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['direction', 'origin'],
    properties: {
      direction: {
        type: 'string',
        enum: ['to_offset', 'to_position'],
        description: 'to_offset needs position; to_position needs eastM and northM.',
      },
      origin: { ...PLACE_SCHEMA, description: 'The tangent point of the plane.' },
      position: { ...PLACE_SCHEMA, description: 'Only for to_offset.' },
      eastM: {
        type: 'number',
        minimum: -MAX_OFFSET_M,
        maximum: MAX_OFFSET_M,
        description: 'Metres east of the origin. Only for to_position.',
      },
      northM: {
        type: 'number',
        minimum: -MAX_OFFSET_M,
        maximum: MAX_OFFSET_M,
        description: 'Metres north of the origin. Only for to_position.',
      },
    },
  },
  handler: runLocalOffset,
};
