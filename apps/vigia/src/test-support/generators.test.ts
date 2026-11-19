import { validateBearing } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NOW_UTC_MS } from './incident-fixtures';
import {
  ALPHABET_FOR_TESTS,
  byteSource,
  CODE_EPOCH_UTC_MS,
  CODE_SPAN_MS,
  codeBearing,
  MAX_ACCURACY_M,
  MAX_LAT_RAD,
  MAX_SIGMA_RAD,
  MIN_SIGMA_RAD,
  pageAddress,
  sightingArb,
  sightingSet,
  symbols,
} from './generators';

const sample = <T>(arbitrary: fc.Arbitrary<T>, numRuns: number, seed: number): T[] =>
  fc.sample(arbitrary, { numRuns, seed });

describe('byteSource (design §11)', () => {
  const draws = sample(byteSource(), 4000, 1);

  it('draws 0 to 64 bytes, at least 18 in about four draws of five', () => {
    expect(Math.max(...draws.map((b) => b.length))).toBeLessThanOrEqual(64);
    expect(Math.min(...draws.map((b) => b.length))).toBeLessThan(18);
    const long = draws.filter((b) => b.length >= 18).length / draws.length;
    expect(long).toBeGreaterThan(0.75);
    expect(long).toBeLessThan(0.85);
  });

  it('draws constant, repeated and random byte strings', () => {
    const long = draws.filter((b) => b.length >= 18);
    expect(long.some((b) => b.every((x) => x === 0x00))).toBe(true);
    expect(long.some((b) => b.every((x) => x === 0xff))).toBe(true);
    expect(long.some((b) => b.every((x, i) => x === b[i % 2]) && b[0] !== b[1])).toBe(true);
    expect(long.some((b) => new Set(b).size > 8)).toBe(true);
  });
});

describe('symbols (design §11)', () => {
  it('draws n symbols of the alphabet, the first and the last of it often', () => {
    const draws = sample(symbols(50), 500, 2);
    expect(
      draws.every((s) => s.length === 50 && [...s].every((c) => ALPHABET_FOR_TESTS.includes(c))),
    ).toBe(true);
    expect(draws.some((s) => s.startsWith('2'))).toBe(true);
    expect(draws.some((s) => s.endsWith('Z'))).toBe(true);
    expect(new Set(draws.join('')).size).toBe(31);
  });

  it('draws the empty string for 0', () => {
    expect(sample(symbols(0), 3, 1)).toEqual(['', '', '']);
  });
});

describe('codeBearing (design §11)', () => {
  const draws = sample(codeBearing(), 6000, 3);

  it('draws only Bearings that Core accepts, inside the code\u2019s ranges', () => {
    for (const b of draws) {
      expect(validateBearing(b).ok, JSON.stringify(b)).toBe(true);
      expect(Math.abs(b.observer.latRad)).toBeLessThanOrEqual(MAX_LAT_RAD);
      expect(b.observer.lonRad).toBeGreaterThan(-Math.PI);
      expect(b.observer.lonRad).toBeLessThanOrEqual(Math.PI);
      expect(Number.isInteger(b.timeUtcMs)).toBe(true);
      expect(b.timeUtcMs).toBeGreaterThanOrEqual(CODE_EPOCH_UTC_MS);
      expect(b.timeUtcMs).toBeLessThan(CODE_EPOCH_UTC_MS + CODE_SPAN_MS);
      expect(b.id).toMatch(/^[2-9A-HJKMNP-Z]{9}$/);
    }
  });

  it('draws every limit of every range', () => {
    const has = (predicate: (b: (typeof draws)[number]) => boolean) => draws.some(predicate);
    expect(has((b) => b.observer.latRad === MAX_LAT_RAD)).toBe(true);
    expect(has((b) => b.observer.latRad === -MAX_LAT_RAD)).toBe(true);
    expect(has((b) => b.observer.lonRad === Math.PI)).toBe(true);
    expect(has((b) => b.observer.lonRad < -Math.PI + 1e-12)).toBe(true);
    expect(has((b) => b.timeUtcMs === CODE_EPOCH_UTC_MS)).toBe(true);
    expect(has((b) => b.timeUtcMs === CODE_EPOCH_UTC_MS + CODE_SPAN_MS - 1)).toBe(true);
    expect(has((b) => b.azimuthRad === 0)).toBe(true);
    expect(has((b) => b.azimuthRad === 2 * Math.PI - 1e-12)).toBe(true);
    expect(has((b) => b.azimuthSigmaRad === MIN_SIGMA_RAD)).toBe(true);
    expect(has((b) => b.azimuthSigmaRad === MAX_SIGMA_RAD)).toBe(true);
    expect(has((b) => b.positionAccuracyM === 0)).toBe(true);
    expect(has((b) => b.positionAccuracyM === MAX_ACCURACY_M)).toBe(true);
  });

  it('spreads over the ranges and not only their ends', () => {
    const mean = (f: (b: (typeof draws)[number]) => number) =>
      draws.reduce((s, b) => s + f(b), 0) / draws.length;
    expect(Math.abs(mean((b) => b.observer.latRad))).toBeLessThan(0.05);
    expect(mean((b) => b.azimuthRad)).toBeGreaterThan(2.8);
    expect(mean((b) => b.azimuthRad)).toBeLessThan(3.5);
    expect(mean((b) => b.positionAccuracyM)).toBeGreaterThan(4500);
    expect(mean((b) => b.positionAccuracyM)).toBeLessThan(5500);
  });
});

describe('sightingArb (design §11)', () => {
  const draws = sample(sightingArb(), 4000, 4);

  it('has its Sighting id equal to its Bearing\u2019s and an Incident id of ten symbols', () => {
    for (const s of draws) {
      expect(s.sightingId).toBe(s.bearing.id);
      expect(s.incidentId).toMatch(/^[2-9A-HJKMNP-Z]{10}$/);
    }
  });

  it('starts the Incident id with Z in about one draw in four, and never with Z in the others by construction', () => {
    const simulation = draws.filter((s) => s.incidentId.startsWith('Z')).length / draws.length;
    expect(simulation).toBeGreaterThan(0.2);
    expect(simulation).toBeLessThan(0.3);
  });

  it('draws both origins, with receivedUtcMs null exactly for a local one', () => {
    expect(draws.some((s) => s.origin === 'local')).toBe(true);
    expect(draws.some((s) => s.origin === 'received')).toBe(true);
    for (const s of draws) {
      if (s.origin === 'local') expect(s.receivedUtcMs).toBeNull();
      else expect(Number.isFinite(s.receivedUtcMs)).toBe(true);
    }
  });
});

describe('pageAddress (Req 10.9)', () => {
  const draws = sample(pageAddress(), 4000, 6);

  it('draws https addresses and, one in four, http://localhost ones, and nothing else', () => {
    for (const address of draws) {
      expect(address).toMatch(/^(?:https:\/\/[a-z0-9][a-z0-9.-]*|http:\/\/localhost(?::\d+)?)\//);
      expect(address).not.toMatch(/\s|@|[A-Z]/);
    }
    const local = draws.filter((a) => a.startsWith('http://localhost')).length / draws.length;
    expect(local).toBeGreaterThan(0.2);
    expect(local).toBeLessThan(0.3);
  });

  it('draws hosts of 1 to 5 labels, paths of 0 to 4 segments, queries and fragments', () => {
    const hosts = draws
      .filter((a) => a.startsWith('https://'))
      .map((a) => a.slice(8).split(/[/?#]/)[0] ?? '');
    expect(new Set(hosts.map((h) => h.split('.').length))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(draws.some((a) => a.includes('?'))).toBe(true);
    expect(draws.some((a) => a.includes('#'))).toBe(true);
    expect(draws.some((a) => !a.includes('?') && !a.includes('#'))).toBe(true);
    expect(draws.some((a) => a.length > 109)).toBe(true);
    expect(draws.some((a) => a.length <= 40)).toBe(true);
  });
});

describe('sightingSet (Req 5.10, 5.11)', () => {
  const draws = sample(sightingSet(), 400, 8);

  it('draws 2 to 12 Sightings, some hidden, some too old, some in the future', () => {
    const sizes = draws.map((d) => d.incident.entries.length);
    expect(Math.min(...sizes)).toBe(2);
    expect(Math.max(...sizes)).toBe(12);
    const all = draws.flatMap((d) => d.incident.entries);
    expect(all.some((e) => e.hidden)).toBe(true);
    expect(all.some((e) => e.sighting.bearing.timeUtcMs < NOW_UTC_MS - 1_800_000)).toBe(true);
    expect(all.some((e) => e.sighting.bearing.timeUtcMs > NOW_UTC_MS + 120_000)).toBe(true);
  });
});
