// P-3.9 (Req 3.4, 3.9): the Sighting id replaces the id of a captured Bearing and changes nothing
// else; the ids are made of the alphabet and have the lengths of design §7.2.

import { validateBearing } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { ALPHABET_FOR_TESTS, byteSource, codeBearing } from '../../test-support/generators';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import {
  incidentIdFromBytes,
  incidentMode,
  isIncidentId,
  isSightingId,
  sightingIdFromBytes,
} from './ids';
import { withSightingId } from './sighting';

const inAlphabet = (text: string) => [...text].every((c) => ALPHABET_FOR_TESTS.includes(c));

describe('P-3.9: the Sighting id (Req 3.4, 3.9)', () => {
  // Generator: `codeBearing` (every Bearing Core accepts inside the code's ranges, limits drawn)
  // re-labelled `bearing-<time>` as Sensors' capture does, and `byteSource` (0 to 64 bytes, four
  // shapes, at least 18 bytes in four draws of five). Draws with fewer than 18 bytes are
  // discarded for the id of nine symbols and fewer than 20 for the id of ten; they are the
  // examples of `invalid_number` in ids.test.ts.
  it('replaces the id, passes validateBearing and differs from the input in id only; ids have 9 and 10 symbols', () => {
    checkProperty(
      'P-3.9',
      fc.property(codeBearing(), byteSource(), (bearing, bytes) => {
        const captured = { ...bearing, id: `bearing-${bearing.timeUtcMs}` };
        expectValid(captured);
        fc.pre(bytes.length >= 20);
        const sightingId = sightingIdFromBytes(bytes);
        if (!sightingId.ok) throw new Error('sightingIdFromBytes failed on 20 bytes');
        const relabelled = withSightingId(captured, sightingId.value);
        if (!validateBearing(relabelled).ok) throw new Error('validateBearing failed');
        // Differs in id only: bit for bit in every other field.
        const { id: oldId, observer: oldObserver, ...oldRest } = captured;
        const { id: newId, observer: newObserver, ...newRest } = relabelled;
        if (oldId === newId) throw new Error('id not replaced');
        if (
          !Object.is(oldObserver.latRad, newObserver.latRad) ||
          !Object.is(oldObserver.lonRad, newObserver.lonRad)
        ) {
          throw new Error('observer changed');
        }
        for (const key of Object.keys(oldRest) as (keyof typeof oldRest)[]) {
          if (!Object.is(oldRest[key], newRest[key])) throw new Error(`${key} changed`);
        }
        if (Object.keys(newRest).length !== Object.keys(oldRest).length)
          throw new Error('fields changed');
        // Lengths and alphabet; the first symbol of an Incident id is Z iff the mode is simulation.
        if (
          sightingId.value.length !== 9 ||
          !inAlphabet(sightingId.value) ||
          !isSightingId(sightingId.value)
        ) {
          throw new Error(`bad sighting id ${sightingId.value}`);
        }
        for (const mode of ['device', 'simulation'] as const) {
          const incident = incidentIdFromBytes(bytes, mode);
          if (!incident.ok) throw new Error('incidentIdFromBytes failed on 20 bytes');
          if (
            incident.value.length !== 10 ||
            !inAlphabet(incident.value) ||
            !isIncidentId(incident.value)
          ) {
            throw new Error(`bad incident id ${incident.value}`);
          }
          if ((incident.value[0] === 'Z') !== (mode === 'simulation'))
            throw new Error('Z does not match the mode');
          if (incidentMode(incident.value) !== mode) throw new Error('incidentMode does not match');
        }
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(10_000) },
    );
  });
});

function expectValid(bearing: Parameters<typeof validateBearing>[0]): void {
  if (!validateBearing(bearing).ok)
    throw new Error(`generator made an invalid Bearing: ${JSON.stringify(bearing)}`);
}
