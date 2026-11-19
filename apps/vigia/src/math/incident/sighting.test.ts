import type { Bearing } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../parameters';
import { decodeSighting, encodeSighting } from '../code/sighting-code';
import { FIXTURE, sightingOf, withBearing } from '../../test-support/sighting-fixture';
import { sightingIdFromBytes } from './ids';
import { canonicalise, captureToSighting, withSightingId, type Sighting } from './sighting';

const PARAMETERS = defaultParameters();

const BEARING: Bearing = {
  id: 'bearing-1790000000000',
  observer: { latRad: 0.5253, lonRad: -0.6981 },
  positionAccuracyM: 8,
  timeUtcMs: 1_790_000_000_000,
  azimuthRad: 0.7942,
  azimuthSigmaRad: 0.0349,
};

describe('withSightingId (Req 3.4, design §7.3)', () => {
  it('changes the id and no other field', () => {
    const relabelled = withSightingId(BEARING, 'H4TN9RV6C');
    expect(relabelled).toEqual({ ...BEARING, id: 'H4TN9RV6C' });
    expect(Object.keys(relabelled).sort()).toEqual(Object.keys(BEARING).sort());
    expect(relabelled.observer).toBe(BEARING.observer);
    for (const field of [
      'positionAccuracyM',
      'timeUtcMs',
      'azimuthRad',
      'azimuthSigmaRad',
    ] as const) {
      expect(Object.is(relabelled[field], BEARING[field])).toBe(true);
    }
  });

  it('does not change the Bearing it was given', () => {
    const before = JSON.stringify(BEARING);
    withSightingId(BEARING, 'H4TN9RV6C');
    expect(JSON.stringify(BEARING)).toBe(before);
  });

  it('keeps -0 and the bits of every number', () => {
    const negativeZero: Bearing = { ...BEARING, azimuthRad: -0 };
    expect(Object.is(withSightingId(negativeZero, 'X').azimuthRad, -0)).toBe(true);
  });
});

describe('canonicalise (Req 8.4, design §7.3, D6)', () => {
  it('gives the Sighting that every phone computes from the code, and the code', () => {
    for (const example of FIXTURE.examples) {
      const result = canonicalise(sightingOf(example.input), PARAMETERS);
      expect(result.ok, example.name).toBe(true);
      if (!result.ok) continue;
      expect(result.value.code).toBe(example.code);
      const decoded = decodeSighting(example.code, PARAMETERS);
      expect(decoded.ok && result.value.sighting.bearing).toEqual(
        decoded.ok && decoded.value.bearing,
      );
      expect(result.value.sighting.bearing).not.toEqual(sightingOf(example.input).bearing);
    }
  });

  it('keeps the origin and the receive time of what it is given, and the ids', () => {
    const a = FIXTURE.examples[0];
    if (a === undefined) throw new Error('fixture');
    const local = canonicalise(sightingOf(a.input), PARAMETERS);
    expect(local.ok && local.value.sighting).toMatchObject({
      sightingId: a.input.sightingId,
      incidentId: a.input.incidentId,
      origin: 'local',
      receivedUtcMs: null,
    });
    const received: Sighting = {
      ...sightingOf(a.input),
      origin: 'received',
      receivedUtcMs: 1_790_000_999_000,
    };
    const result = canonicalise(received, PARAMETERS);
    expect(result.ok && result.value.sighting).toMatchObject({
      origin: 'received',
      receivedUtcMs: 1_790_000_999_000,
    });
    expect(result.ok && result.value.code).toBe(a.code);
  });

  it('is idempotent and a fixed point: the canonical Sighting canonicalises to itself, with the same code', () => {
    for (const example of FIXTURE.examples) {
      const first = canonicalise(sightingOf(example.input), PARAMETERS);
      if (!first.ok) throw new Error('canonicalise failed');
      const second = canonicalise(first.value.sighting, PARAMETERS);
      expect(second).toEqual(first);
      expect(encodeSighting(first.value.sighting)).toEqual({ ok: true, value: first.value.code });
    }
  });

  it('returns the failure of the encoder, unchanged, for a Sighting it cannot encode', () => {
    const outside = withBearing({ timeUtcMs: 1_767_225_599_999 });
    expect(canonicalise(outside, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_observation',
      field: 'timeUtcMs',
      id: 'H4TN9RV6C',
    });
    expect(canonicalise({ ...withBearing({}), incidentId: 'x' }, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentId',
    });
  });
});

describe('captureToSighting (Req 3.4, 3.8, 3.9, design §7.3)', () => {
  /** What Sensors' capture returns: a Bearing named `bearing-<time of the freeze>`. */
  const captured = (): ReturnType<typeof withBearing>['bearing'] => ({
    ...withBearing({}).bearing,
    id: 'bearing-1790000000000',
  });
  const bytes = Uint8Array.from({ length: 18 }, (_, i) => (i * 29 + 3) % 256);

  it('replaces the id from 18 bytes, makes a local Sighting of the open Incident and canonicalises it', () => {
    const result = captureToSighting(captured(), bytes, 'K7PQ3MWXA2', PARAMETERS);
    if (!result.ok) throw new Error(`failed: ${result.reason}`);
    const id = sightingIdFromBytes(bytes);
    if (!id.ok) throw new Error('id');
    const { sighting, code } = result.value;
    expect(sighting.sightingId).toBe(id.value);
    expect(sighting.bearing.id).toBe(id.value);
    expect(sighting.incidentId).toBe('K7PQ3MWXA2');
    expect(sighting.origin).toBe('local');
    expect(sighting.receivedUtcMs).toBeNull();
    // Canonical: the Bearing every phone computes from the code, not the sensor's own numbers.
    const decoded = decodeSighting(code, PARAMETERS);
    expect(decoded.ok && decoded.value.bearing).toEqual(sighting.bearing);
    expect(sighting.bearing.timeUtcMs).toBe(1_790_000_000_500);
    expect(sighting.bearing).not.toEqual(withSightingId(captured(), id.value));
  });

  it('keeps the Bearing\u2019s other fields to the precision of the code', () => {
    const result = captureToSighting(captured(), bytes, 'K7PQ3MWXA2', PARAMETERS);
    if (!result.ok) throw new Error('failed');
    const original = captured();
    const b = result.value.sighting.bearing;
    expect(Math.abs(b.observer.latRad - original.observer.latRad)).toBeLessThan(1e-7);
    expect(Math.abs(b.azimuthRad - original.azimuthRad)).toBeLessThan(1e-5);
    expect(b.azimuthSigmaRad).toBeGreaterThanOrEqual(original.azimuthSigmaRad);
    expect(b.positionAccuracyM).toBeGreaterThanOrEqual(original.positionAccuracyM);
  });

  it('is the same for the same bytes, and a different Sighting id for different bytes', () => {
    const a = captureToSighting(captured(), bytes, 'K7PQ3MWXA2', PARAMETERS);
    const b = captureToSighting(captured(), bytes, 'K7PQ3MWXA2', PARAMETERS);
    expect(a).toEqual(b);
    const other = captureToSighting(
      captured(),
      bytes.map((x) => x ^ 0x55),
      'K7PQ3MWXA2',
      PARAMETERS,
    );
    expect(
      other.ok && a.ok && other.value.sighting.sightingId !== a.value.sighting.sightingId,
    ).toBe(true);
  });

  it('fails with invalid_number naming bytes for 17 bytes, and takes the first 18 of more', () => {
    expect(captureToSighting(captured(), bytes.slice(0, 17), 'K7PQ3MWXA2', PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'bytes',
    });
    const longer = new Uint8Array(40).fill(0xff);
    longer.set(bytes);
    expect(captureToSighting(captured(), longer, 'K7PQ3MWXA2', PARAMETERS)).toEqual(
      captureToSighting(captured(), bytes, 'K7PQ3MWXA2', PARAMETERS),
    );
  });

  it('returns the failure of the encoding, and no Sighting, for a capture it cannot encode', () => {
    const late = { ...captured(), timeUtcMs: 2_398_377_600_000 };
    expect(captureToSighting(late, bytes, 'K7PQ3MWXA2', PARAMETERS)).toMatchObject({
      ok: false,
      reason: 'invalid_observation',
      field: 'timeUtcMs',
    });
    expect(
      captureToSighting({ ...captured(), azimuthRad: Number.NaN }, bytes, 'K7PQ3MWXA2', PARAMETERS),
    ).toMatchObject({
      ok: false,
      reason: 'invalid_observation',
      field: 'azimuthRad',
    });
    expect(captureToSighting(captured(), bytes, 'not-an-id', PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentId',
    });
  });
});
