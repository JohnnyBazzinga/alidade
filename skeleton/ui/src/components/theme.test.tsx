import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LiveReadout } from '../math/session/session';
import { sessionInState } from '../test-support/session-fixtures';
import { CaptureSummary } from './CaptureSummary';
import { ControlBar } from './ControlBar';
import { FailureNotice } from './FailureNotice';
import { LimitsNote } from './LimitsNote';
import { Readout } from './Readout';
import { contrastRatio } from '../math/contrast';
import { MAP_DARK, MAP_FIX, MAP_LIGHT } from '../math/map/map-style';
import {
  BODY_FONT_STACK,
  COLOURS,
  HAIRLINE_MIN_RATIO,
  INSTRUMENT_TOKENS,
  NUMERAL_STYLE,
  NUMERIC_FONT_STACK,
  MAP_FIX_COLOUR,
  PALETTE_PAIRS,
  SIZES,
  hexToRgb,
  type PalettePair,
} from './theme';
import { MIN_CONTRAST_RATIO, MIN_READOUT_FONT_PX } from '../defaults';

function ratio(foreground: string, background: string): number {
  const r = contrastRatio(hexToRgb(foreground), hexToRgb(background));
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

/** The pairs below the minimum: what the test of Req 13.11 fails on. */
function belowMinimum(pairs: readonly PalettePair[]): string[] {
  return pairs
    .filter((p) => ratio(p.foreground, p.background) < MIN_CONTRAST_RATIO)
    .map((p) => p.label);
}

/** Instrument's values: the components write roles (Req 22.2), the pairs are measured on these. */
const T = INSTRUMENT_TOKENS;

describe('the palette (Req 13.2, 13.11, design §7.18)', () => {
  it('holds 7:1 for every pair', () => {
    expect(belowMinimum(PALETTE_PAIRS)).toEqual([]);
  });

  it('fails when a pair below 7:1 is added', () => {
    const bad: PalettePair = {
      label: 'rule on raised',
      foreground: T.rule,
      background: T.raised,
    };
    expect(belowMinimum([...PALETTE_PAIRS, bad])).toEqual(['rule on raised']);
  });

  it('gives the ratios of design §7.18 to two decimals', () => {
    expect(ratio(T.ink, T.bg).toFixed(2)).toBe('15.69');
    expect(ratio(T.inkDim, T.raised).toFixed(2)).toBe('7.56');
    expect(ratio(T.rule, T.raised).toFixed(2)).toBe('3.42');
  });

  // Task 31 continued (Req 15.2): the map's attribution is the map's dark ink on its light ink.
  it('holds the map attribution, outline on mapInk, among its pairs at 7:1', () => {
    const pair = PALETTE_PAIRS.find((p) => p.label === 'outline on mapInk (map attribution)');
    expect(pair).toEqual({
      label: 'outline on mapInk (map attribution)',
      foreground: T.outline,
      background: T.mapInk,
    });
    expect(ratio(T.outline, T.mapInk)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('holds the hairline to 3:1 against every surface', () => {
    for (const surface of [T.bg, T.panel, T.raised]) {
      expect(ratio(T.rule, surface)).toBeGreaterThanOrEqual(HAIRLINE_MIN_RATIO);
    }
  });

  it('uses the map tokens of the Math layer (design D27.16)', () => {
    expect(T.outline).toBe(MAP_DARK);
    expect(T.mapInk).toBe(MAP_LIGHT);
    expect(T.brass).toBe(MAP_FIX);
    expect(MAP_FIX_COLOUR).toBe(T.brass);
    // Req 22.2: the component writes the role; Instrument's value of the role is the map's token.
    expect(COLOURS.outline).toBe('var(--alidade-reticleOutline)');
    expect(COLOURS.mapInk).toBe('var(--alidade-mapInk)');
  });

  it('keeps the sizes of Req 13 and 19', () => {
    expect(SIZES.labelPx).toBeGreaterThanOrEqual(MIN_READOUT_FONT_PX);
    expect(SIZES.touchPx).toBe(48);
    expect(SIZES.primaryPx).toBe(64);
    expect(SIZES.gapPx).toBe(8);
  });
});

// Req 13.4 as amended 2026-11-21, design D36: two stacks, and no size, colour or contrast lowered.
const INDEX_SOURCE = Object.values(
  import.meta.glob<string>('../index.ts', { query: '?raw', import: 'default', eager: true }),
)[0];

describe('the two font stacks (Req 13.4, D36)', () => {
  it('has the body stack and the numeric stack exactly', () => {
    expect(BODY_FONT_STACK).toBe('system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    expect(NUMERIC_FONT_STACK).toBe(
      'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    );
    expect(NUMERAL_STYLE.fontFamily).toBe(NUMERIC_FONT_STACK);
    expect(NUMERAL_STYLE.fontVariantNumeric).toBe('tabular-nums');
  });

  it('no longer exports FONT_STACK, so that no use is chosen silently', () => {
    const index = INDEX_SOURCE ?? '';
    expect(index).not.toBe('');
    expect(index).not.toMatch(/\bFONT_STACK\b/);
    expect(index).toMatch(/BODY_FONT_STACK/);
    expect(index).toMatch(/NUMERIC_FONT_STACK/);
  });

  it('sets prose and control labels in the body stack', () => {
    const body = (el: Element | null) => (el as HTMLElement).style.fontFamily;
    const bar = render(<ControlBar controls={[{ id: 'a', label: 'A', onPress: () => {} }]} />);
    expect(body(bar.container.querySelector('button'))).toContain('sans-serif');
    bar.unmount();
    const note = render(<FailureNotice failure={{ reason: 'permission_denied' }} />);
    expect(body(note.getByTestId('failure-notice'))).toContain('sans-serif');
    note.unmount();
    const limits = render(<LimitsNote />);
    expect(body(limits.getByTestId('limits-note'))).toContain('sans-serif');
  });

  it('sets numerals in the numeric stack', () => {
    const readout: LiveReadout = {
      timeUtcMs: 1,
      sampleCount: 12,
      newestSampleUtcMs: 1,
      azimuth: { ok: true, value: { northReference: 'true', azimuthRad: 1 } },
      apparentAltitudeRad: { ok: true, value: 0.2 },
      azimuthSpreadRad: 0.004,
      altitudeStdDevRad: 0.001,
      steadiness: 'steady',
      stale: false,
    };
    const r = render(<Readout readout={readout} />);
    const numerals = r.getByTestId('readout').querySelectorAll<HTMLElement>('span');
    expect(numerals.length).toBeGreaterThan(0);
    for (const n of numerals) expect(n.style.fontFamily).toContain('monospace');
    r.unmount();
    const result = sessionInState('captured', 'bearing').session.captured;
    if (result === null) throw new Error('not captured');
    const c = render(<CaptureSummary result={result} />);
    const headline = c
      .getByTestId('capture-summary')
      .querySelector<HTMLElement>('[data-part="headline"]');
    expect(headline?.style.fontFamily).toContain('monospace');
  });

  it('lowers no size, colour or contrast (values typed here, not read from the theme)', () => {
    // Req 22.2 (task 35.3): today's tokens are aliases of roles; Instrument keeps today's values.
    expect(COLOURS).toEqual({
      bg: 'var(--alidade-bg)',
      panel: 'var(--alidade-card)',
      raised: 'var(--alidade-raised)',
      ink: 'var(--alidade-ink)',
      inkDim: 'var(--alidade-inkDim)',
      brass: 'var(--alidade-primary)',
      brassInk: 'var(--alidade-primaryInk)',
      alert: 'var(--alidade-warnInk)',
      outline: 'var(--alidade-reticleOutline)',
      mapInk: 'var(--alidade-mapInk)',
      rule: 'var(--alidade-rule)',
    });
    expect(INSTRUMENT_TOKENS).toEqual({
      bg: '#0C0F12',
      panel: '#141A1F',
      raised: '#1D252C',
      ink: '#ECE8DC',
      inkDim: '#AEB6BD',
      brass: '#E3AE45',
      brassInk: '#14100A',
      alert: '#FF9B7A',
      outline: MAP_DARK,
      mapInk: MAP_LIGHT,
      rule: '#6A7884',
    });
    expect(SIZES).toEqual({
      numeralPx: 32,
      labelPx: 20,
      touchPx: 48,
      primaryPx: 64,
      gapPx: 8,
      reticleCorePx: 2,
      reticleOutlinePx: 1,
      reticleGapPx: 8,
      reticleArmPx: 28,
      markRingPx: 28,
      markRingCorePx: 2,
      markRingOutlinePx: 1,
    });
    expect(PALETTE_PAIRS.map((p) => p.label)).toEqual([
      ...['ink', 'inkDim', 'brass', 'alert'].flatMap((fg) =>
        ['bg', 'panel', 'raised'].map((bg) => `${fg} on ${bg}`),
      ),
      'brassInk on brass',
      'brass on black',
      'outline on white',
      'outline on brass',
      'mapInk on black',
      'outline on mapInk (map attribution)',
    ]);
    expect(belowMinimum(PALETTE_PAIRS)).toEqual([]);
  });
});
