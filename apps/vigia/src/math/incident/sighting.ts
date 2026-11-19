// The Sighting: one Bearing as Vigia handles it (glossary, design §6, §7.3).

import { validateBearing, type Bearing } from '@alidade/core';
import { ok, type VigiaResult } from '../../result';
import { decodeSighting, encodeSighting } from '../code/sighting-code';
import type { VigiaParameters } from '../parameters';
import { sightingIdFromBytes } from './ids';

export interface Sighting {
  /** 9 symbols; equals `bearing.id`. */
  readonly sightingId: string;
  /** 10 symbols; the first is `Z` in Simulation mode and never otherwise. */
  readonly incidentId: string;
  /** The canonical Bearing: decoded from its own code. */
  readonly bearing: Bearing;
  readonly origin: 'local' | 'received';
  /** `null` for a local one; the Clock's time when the user added a received one. */
  readonly receivedUtcMs: number | null;
}

/**
 * The Bearing with a new `id` and nothing else changed (Req 3.4, P-3.9). Sensors' capture names
 * a Bearing `bearing-<time of the freeze>`, which two phones, or two Stations of the Simulator,
 * can share; Core refuses a set with a repeated id. The result is validated with Core's
 * `validateBearing` first, and its failure is returned unchanged, so that a `NaN` in the input
 * never comes back out (Req 2.1).
 */
export function withSightingId(bearing: Bearing, sightingId: string): VigiaResult<Bearing> {
  const relabelled: Bearing = { ...bearing, id: sightingId };
  const valid = validateBearing(relabelled);
  if (!valid.ok) return valid;
  return ok(relabelled);
}

/**
 * The canonical Sighting (Req 8.4, design D6): what every phone computes from its code. The code
 * is `encodeSighting(sighting)`, the Sighting is the code decoded again, with the origin and the
 * receive time of the input. The sender's own Sighting set holds exactly what the receivers hold,
 * so that all phones get the same Fix (P-9.6). A Sighting the code cannot hold is returned as the
 * failure of the encoder, unchanged. Idempotent: a canonical Sighting canonicalises to itself.
 */
export function canonicalise(
  sighting: Sighting,
  parameters: VigiaParameters,
): VigiaResult<{ readonly sighting: Sighting; readonly code: string }> {
  const code = encodeSighting(sighting);
  if (!code.ok) return code;
  const decoded = decodeSighting(code.value, parameters);
  if (!decoded.ok) return decoded;
  return ok({
    sighting: { ...decoded.value, origin: sighting.origin, receivedUtcMs: sighting.receivedUtcMs },
    code: code.value,
  });
}

/**
 * A captured Bearing as a local Sighting of the open Incident (Req 3.4, 3.8, design D6): the id
 * from 18 bytes of the Random adapter replaces the Bearing's own (`bearing-<time>`, which two
 * phones can share), then the Sighting is made canonical. A capture whose encoding fails (a
 * time outside the code's 20 years, an observer or a sigma outside its ranges) is returned as the
 * failure and nothing is made.
 */
export function captureToSighting(
  captured: Bearing,
  bytes: Uint8Array,
  incidentId: string,
  parameters: VigiaParameters,
): VigiaResult<{ readonly sighting: Sighting; readonly code: string }> {
  const sightingId = sightingIdFromBytes(bytes);
  if (!sightingId.ok) return sightingId;
  const bearing = withSightingId(captured, sightingId.value);
  if (!bearing.ok) return bearing;
  return canonicalise(
    {
      sightingId: sightingId.value,
      incidentId,
      bearing: bearing.value,
      origin: 'local',
      receivedUtcMs: null,
    },
    parameters,
  );
}
