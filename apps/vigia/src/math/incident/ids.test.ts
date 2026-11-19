import { describe, expect, it } from 'vitest';
import { createSeededNormal } from '../../test-support/seeded-normal';
import {
  idFromBytes,
  incidentIdFromBytes,
  incidentMode,
  isIncidentId,
  isSightingId,
  sightingIdFromBytes,
} from './ids';

const constant = (value: number, length: number) => new Uint8Array(length).fill(value);

describe('sightingIdFromBytes (Req 3.4, design §7.2)', () => {
  it('turns two bytes into a symbol: nine symbols from 18 bytes', () => {
    expect(sightingIdFromBytes(constant(0x00, 18))).toEqual({ ok: true, value: '222222222' });
    // 0xFFFF = 65 535 = 31 · 2 114 + 1: the symbol of value 1.
    expect(sightingIdFromBytes(constant(0xff, 18))).toEqual({ ok: true, value: '333333333' });
  });

  it('reads the bytes in pairs, high byte first, modulo 31', () => {
    const bytes = Uint8Array.from({ length: 18 }, (_, i) => i);
    // The pairs are (0,1)=1, (2,3)=515, (4,5)=1029, (6,7)=1543, (8,9)=2057, (10,11)=2571,
    // (12,13)=3085, (14,15)=3599, (16,17)=4113; modulo 31: 1, 19, 6, 24, 11, 29, 16, 3, 21;
    // the symbols of those values: 3, N, 8, T, D, Y, J, 5, Q.
    expect(sightingIdFromBytes(bytes)).toEqual({ ok: true, value: '3N8TDYJ5Q' });
    expect(idFromBytes(Uint8Array.of(0, 31, 1, 0), 2)).toEqual({ ok: true, value: '2A' });
  });

  it('uses the first 18 bytes of a longer source and nothing of the rest', () => {
    const base = Uint8Array.from({ length: 18 }, (_, i) => (i * 37) % 256);
    const longer = new Uint8Array(64);
    longer.set(base);
    longer.fill(0xff, 18);
    expect(sightingIdFromBytes(longer)).toEqual(sightingIdFromBytes(base));
  });

  it('fails with invalid_number naming bytes for 17 bytes or fewer', () => {
    for (const length of [0, 1, 17]) {
      expect(sightingIdFromBytes(constant(0x00, length))).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'bytes',
      });
    }
    expect(sightingIdFromBytes(constant(0x00, 18)).ok).toBe(true);
  });
});

describe('incidentIdFromBytes (Req 4.1, design §7.2)', () => {
  it('needs 20 bytes for ten symbols, and fails with invalid_number naming bytes for 19', () => {
    expect(incidentIdFromBytes(constant(0x00, 19), 'device')).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'bytes',
    });
    expect(incidentIdFromBytes(constant(0x00, 20), 'device').ok).toBe(true);
    expect(incidentIdFromBytes(constant(0x00, 19), 'simulation').ok).toBe(false);
  });

  it('gives valid ids for constant byte strings, in both modes', () => {
    // Device: the first symbol is the pair modulo 30 (0xFFFF = 30 · 2 184 + 15: the symbol H).
    expect(incidentIdFromBytes(constant(0x00, 20), 'device')).toEqual({
      ok: true,
      value: '2222222222',
    });
    expect(incidentIdFromBytes(constant(0xff, 20), 'device')).toEqual({
      ok: true,
      value: 'H333333333',
    });
    expect(incidentIdFromBytes(constant(0x00, 20), 'simulation')).toEqual({
      ok: true,
      value: 'Z222222222',
    });
    expect(incidentIdFromBytes(constant(0xff, 20), 'simulation')).toEqual({
      ok: true,
      value: 'Z333333333',
    });
  });

  it('never starts with Z in device mode, over 10 000 byte strings of the extremes', () => {
    const random = createSeededNormal(2026);
    // Each byte is 0x00, 0x01, 0x1E, 0x1F, 0xFE, 0xFF or any value: the pairs that make the
    // modulus matter (0, 29, 30, 31, 65 534, 65 535) all occur.
    const pick = () => {
      const u = random.nextUnit();
      if (u < 0.6)
        return [0x00, 0x01, 0x1e, 0x1f, 0xfe, 0xff][Math.floor(random.nextUnit() * 6)] ?? 0;
      return Math.floor(random.nextUnit() * 256);
    };
    const firsts = new Set<string>();
    for (let run = 0; run < 10_000; run += 1) {
      const bytes = Uint8Array.from({ length: 20 }, pick);
      const device = incidentIdFromBytes(bytes, 'device');
      const simulation = incidentIdFromBytes(bytes, 'simulation');
      if (!device.ok || !simulation.ok) throw new Error('an id was refused');
      expect(device.value[0], device.value).not.toBe('Z');
      expect(simulation.value[0]).toBe('Z');
      expect(device.value.slice(1)).toBe(simulation.value.slice(1));
      expect(incidentMode(device.value)).toBe('device');
      expect(incidentMode(simulation.value)).toBe('simulation');
      firsts.add(device.value[0] ?? '');
    }
    expect(firsts.size).toBeGreaterThan(20);
  });
});

describe('idFromBytes', () => {
  it('makes an id of any length, from 2 bytes a symbol, and fails for fewer bytes', () => {
    expect(idFromBytes(new Uint8Array(0), 0)).toEqual({ ok: true, value: '' });
    expect(idFromBytes(constant(0, 2), 1)).toEqual({ ok: true, value: '2' });
    expect(idFromBytes(constant(0, 3), 2)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'bytes',
    });
  });

  it('fails with invalid_number naming length for a length that is not a count of at most 64', () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity, 1e9, 65]) {
      expect(idFromBytes(constant(0, 200), bad)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'length',
      });
    }
    expect(idFromBytes(constant(0, 128), 64)).toEqual({ ok: true, value: '2'.repeat(64) });
  });

  it('fails with invalid_number naming firstSymbolModulus for a modulus outside 1 to 31', () => {
    for (const bad of [0, -1, 32, 1.5, Number.NaN]) {
      expect(idFromBytes(constant(0, 20), 10, bad)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'firstSymbolModulus',
      });
    }
    expect(idFromBytes(constant(0xff, 2), 1, 1)).toEqual({ ok: true, value: '2' });
  });
});

describe('isIncidentId, isSightingId and incidentMode', () => {
  it('check the length and the alphabet and nothing else', () => {
    expect(isIncidentId('K7PQ3MWXA2')).toBe(true);
    expect(isIncidentId('ZB4N8RTY5C')).toBe(true);
    expect(isIncidentId('K7PQ3MWXA')).toBe(false);
    expect(isIncidentId('K7PQ3MWXA22')).toBe(false);
    expect(isIncidentId('K7PQ3MWXA0')).toBe(false);
    expect(isIncidentId('k7pq3mwxa2')).toBe(false);
    expect(isIncidentId('')).toBe(false);
    expect(isSightingId('H4TN9RV6C')).toBe(true);
    expect(isSightingId('H4TN9RV6')).toBe(false);
    expect(isSightingId('H4TN9RV6CC')).toBe(false);
    expect(isSightingId('H4TN9RV6L')).toBe(false);
    expect(isSightingId('H4TN9 V6C')).toBe(false);
    expect(isSightingId('H4TN9-V6C')).toBe(false);
  });

  it('read the whole string: a line break or a trailing character is not tolerated', () => {
    expect(isSightingId('H4TN9RV6C\n')).toBe(false);
    expect(isIncidentId('K7PQ3MWXA2\n')).toBe(false);
  });

  it('incidentMode is simulation exactly when the first symbol is Z', () => {
    expect(incidentMode('ZB4N8RTY5C')).toBe('simulation');
    expect(incidentMode('K7PQ3MWXA2')).toBe('device');
    expect(incidentMode('C222222222')).toBe('device');
    expect(incidentMode('')).toBe('device');
    expect(incidentMode('z222222222')).toBe('device');
  });
});
