// The stored format and its parser (Req 12.1, 12.2, 12.6; design §5 "Stored format").

import { describe, expect, it } from 'vitest';
import { sightOf } from '../../test-support/captures';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import {
  parseStoredState,
  serialiseState,
  STORAGE_FORMAT,
  STORAGE_VERSION,
} from './storage-format';
import type { NoniusState } from './apply-action';

const params = defaultParameters();
const IE = {
  valueRad: -3.3 * DEG_TO_RAD,
  sigmaRad: 0.2 * DEG_TO_RAD,
  sightCount: 3,
  measuredUtcMs: Date.UTC(2026, 10, 20),
  simulated: false,
};
const STATE: NoniusState = {
  sights: [
    sightOf({ id: 'a', sunSide: { azimuthRad: 1.5, northReference: 'magnetic' } }),
    sightOf({ id: 'b', timeUtcMs: Date.UTC(2026, 11, 21, 15) }),
  ],
  indexError: IE,
};

function parse(text: string | null) {
  const r = parseStoredState(text, params);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe('the stored format', () => {
  it('round-trips the Sights and the Index error bit for bit', () => {
    const text = serialiseState(STATE);
    const back = parse(text);
    if (back.kind !== 'loaded') throw new Error(back.kind);
    expect(back.state).toEqual(STATE);
    expect(back.dropped).toBe(0);
    expect(JSON.parse(text)).toMatchObject({ format: STORAGE_FORMAT, version: STORAGE_VERSION });
  });

  it('holds no Position anywhere', () => {
    const text = serialiseState(STATE);
    expect(text).not.toContain('latRad');
    expect(text).not.toContain('lonRad');
  });

  it('no text is empty', () => {
    expect(parse(null)).toEqual({ kind: 'empty' });
  });

  it.each([
    ['not JSON', '{oops'],
    ['an array', '[]'],
    ['a foreign format', JSON.stringify({ format: 'vigia-state', version: 1, sights: [] })],
    ['a missing list', JSON.stringify({ format: STORAGE_FORMAT, version: 1 })],
    ['too long', 'x'.repeat(1_000_001)],
  ])('is corrupt when %s, and keeps the raw text for the backup', (_name, text) => {
    const r = parse(text);
    expect(r.kind).toBe('corrupt');
    if (r.kind === 'corrupt') expect(r.raw).toBe(text);
  });

  it('leaves a newer version alone', () => {
    const r = parse(JSON.stringify({ format: STORAGE_FORMAT, version: STORAGE_VERSION + 1 }));
    expect(r).toEqual({ kind: 'newer', version: STORAGE_VERSION + 1 });
  });

  it('drops a bad Sight, a duplicate id and a time outside the Sun wrapper, and counts them', () => {
    const good = JSON.parse(serialiseState(STATE)) as { sights: Record<string, unknown>[] };
    const bad = [
      { ...good.sights[0], id: 'nan', rawApparentAltitudeRad: null },
      { ...good.sights[0] },
      { ...good.sights[1], id: 'old', timeUtcMs: 0 },
      { ...good.sights[1], id: 7 },
    ];
    const text = JSON.stringify({ ...good, sights: [...good.sights, ...bad] });
    const r = parse(text);
    if (r.kind !== 'loaded') throw new Error(r.kind);
    expect(r.state.sights.map((s) => s.id)).toEqual(['a', 'b']);
    expect(r.dropped).toBe(4);
  });

  it('drops an Index error with a number that is not finite or beyond the limit', () => {
    const good = JSON.parse(serialiseState(STATE)) as Record<string, unknown>;
    const r = parse(JSON.stringify({ ...good, indexError: { ...IE, valueRad: 1 } }));
    if (r.kind !== 'loaded') throw new Error(r.kind);
    expect(r.state.indexError).toBeNull();
    expect(r.dropped).toBe(1);
  });

  it('keeps no more than MAX_SIGHTS', () => {
    const many = {
      sights: Array.from({ length: params.maxSights + 3 }, (_, i) => sightOf({ id: `s${i}` })),
      indexError: null,
    };
    const r = parse(serialiseState(many));
    if (r.kind !== 'loaded') throw new Error(r.kind);
    expect(r.state.sights).toHaveLength(params.maxSights);
    expect(r.dropped).toBe(3);
  });
});
