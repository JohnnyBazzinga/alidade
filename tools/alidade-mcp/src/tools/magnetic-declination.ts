// `magnetic_declination`: Sensors' WMM2025 model at a position and date (Req 6.2).

import { radToDeg } from '@alidade/core';
import { declinationAt } from '@alidade/sensors';
import { finiteNumber, objectOf } from '../check.ts';
import { own } from '../json-rpc.ts';
import { failure, finiteOrFailure, type Outcome } from '../outcome.ts';
import type { ToolDefinition } from '../tool-definition.ts';
import { toPosition } from './places.ts';

const KEYS = ['latDeg', 'lonDeg', 'timeUtcMs'];

export function runMagneticDeclination(args: unknown): Outcome {
  const object = objectOf(args, '', KEYS);
  if (!object.ok) return failure('invalid_arguments', { field: object.field });
  const numbers: Record<string, number> = {};
  for (const key of KEYS) {
    const number = finiteNumber(own(object.value, key), key);
    if (!number.ok) return failure('invalid_arguments', { field: number.field });
    numbers[key] = number.value;
  }
  const position = toPosition({ latDeg: numbers['latDeg'] ?? 0, lonDeg: numbers['lonDeg'] ?? 0 });
  if (!position.ok) return failure(position.reason);

  const declination = declinationAt(position.value, numbers['timeUtcMs'] ?? 0);
  if (!declination.ok) return failure(declination.reason);
  const declinationDeg = radToDeg(declination.value.declinationRad);
  if (!declinationDeg.ok) return failure(declinationDeg.reason);
  const sigmaDeg = radToDeg(declination.value.sigmaRad);
  if (!sigmaDeg.ok) return failure(sigmaDeg.reason);

  return finiteOrFailure({
    ok: true,
    declinationDeg: declinationDeg.value,
    sigmaDeg: sigmaDeg.value,
    positiveEast: true,
  });
}

export const MAGNETIC_DECLINATION: ToolDefinition = {
  name: 'magnetic_declination',
  description:
    'The magnetic declination at a place and date, from the World Magnetic Model 2025, with its 1-sigma. ' +
    'Positive east: true azimuth = magnetic azimuth + declination. Fails outside the model’s dates ' +
    'and near the magnetic poles.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: KEYS,
    properties: {
      latDeg: { type: 'number', description: 'Latitude in degrees, north positive.' },
      lonDeg: { type: 'number', description: 'Longitude in degrees, east positive.' },
      timeUtcMs: {
        type: 'number',
        description: 'Time, milliseconds since the Unix epoch, UTC.',
      },
    },
  },
  handler: runMagneticDeclination,
};
