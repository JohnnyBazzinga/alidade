// The fixture of design §8.7 (fixtures/sighting-codes.json), read once for the tests (test support,
// not exported). The fixture is read-only: a test is fixed to match it, never the reverse
// (testing.md, rule 3). `sightingOf` builds the Sighting an example describes, through Core.

import { degToRad, radToDeg, type Bearing } from '@alidade/core';
import type { Sighting } from '../math/incident/sighting';

export interface Example {
  readonly name: string;
  readonly input: {
    readonly incidentId: string;
    readonly sightingId: string;
    readonly latDeg: number;
    readonly lonDeg: number;
    readonly timeUtcMs: number;
    readonly azimuthDeg: number;
    readonly azimuthSigmaDeg: number;
    readonly positionAccuracyM: number;
  };
  readonly code: string;
  readonly codeGrouped: string;
  readonly payload: string;
  readonly check: string;
  readonly decoded: {
    readonly latDeg: number;
    readonly lonDeg: number;
    readonly timeUtcMs: number;
    readonly azimuthDeg: number;
    readonly azimuthSigmaDeg: number;
    readonly positionAccuracyM: number;
  };
}
export const FIXTURE: { readonly examples: readonly Example[] } = JSON.parse(
  Object.values(
    import.meta.glob<string>('../../fixtures/sighting-codes.json', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  )[0] ?? 'null',
) as { readonly examples: readonly Example[] };

export const rad = (angleDeg: number): number => {
  const result = degToRad(angleDeg);
  if (!result.ok) throw new Error('degToRad failed');
  return result.value;
};
export const deg = (angleRad: number): number => {
  const result = radToDeg(angleRad);
  if (!result.ok) throw new Error('radToDeg failed');
  return result.value;
};

export function sightingOf(input: Example['input']): Sighting {
  const bearing: Bearing = {
    id: input.sightingId,
    observer: { latRad: rad(input.latDeg), lonRad: rad(input.lonDeg) },
    positionAccuracyM: input.positionAccuracyM,
    timeUtcMs: input.timeUtcMs,
    azimuthRad: rad(input.azimuthDeg),
    azimuthSigmaRad: rad(input.azimuthSigmaDeg),
  };
  return {
    sightingId: input.sightingId,
    incidentId: input.incidentId,
    bearing,
    origin: 'local',
    receivedUtcMs: null,
  };
}

/** A Sighting like example A, with one Bearing field changed. */
export function withBearing(change: Partial<Bearing>, incidentId = 'K7PQ3MWXA2'): Sighting {
  const a = FIXTURE.examples[0];
  if (a === undefined) throw new Error('fixture');
  const base = sightingOf(a.input);
  return { ...base, incidentId, bearing: { ...base.bearing, ...change } };
}

export const exampleA = (): Example => {
  const a = FIXTURE.examples[0];
  if (a === undefined) throw new Error('fixture');
  return a;
};
