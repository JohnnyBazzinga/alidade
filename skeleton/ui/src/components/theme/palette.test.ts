// Every pair of every theme at its threshold (Req 22.3, 13.2, 13.11; design D37, Vigia D25.1):
// text at 7, an icon or an outline that carries meaning at 3. The pairs are data, and a role that
// is added without a pair fails.

import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../math/contrast';
import { hexToRgb } from '../theme';
import { ROLES } from './roles';
import { paletteFor, TEXT_MIN_RATIO, ICON_MIN_RATIO, type ThemePair } from './palette';
import { field, fieldNight, instrument, THEMES, type Theme } from './themes';

function ratio(foreground: string, background: string): number {
  const r = contrastRatio(hexToRgb(foreground), hexToRgb(background));
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

const below = (pairs: readonly ThemePair[]) =>
  pairs.filter((p) => ratio(p.foreground, p.background) < p.minRatio).map((p) => p.label);

describe('the palette of each theme (Req 22.3)', () => {
  it('has the thresholds of the requirement', () => {
    expect(TEXT_MIN_RATIO).toBe(7);
    expect(ICON_MIN_RATIO).toBe(3);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))(
    '%s: every pair is at its threshold',
    (_id, theme) => {
      expect(below(paletteFor(theme))).toEqual([]);
    },
  );

  it('fails when a pair below its threshold is added', () => {
    const bad: ThemePair = {
      label: 'rule on card',
      foreground: field.colours.rule,
      background: field.colours.card,
      minRatio: TEXT_MIN_RATIO,
    };
    expect(below([...paletteFor(field), bad])).toEqual(['rule on card']);
  });

  it('fails when a status icon is below 3', () => {
    const bad: ThemePair = {
      label: 'warnBar as an icon on warnTint',
      foreground: field.colours.warnBar,
      background: field.colours.warnTint,
      minRatio: ICON_MIN_RATIO,
    };
    expect(below([bad])).toEqual([bad.label]);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))(
    '%s: every role is in a pair, except the five that are decorative',
    (_id, theme: Theme) => {
      const used = new Set<string>();
      for (const p of paletteFor(theme)) {
        if (p.foregroundRole !== undefined) used.add(p.foregroundRole);
        if (p.backgroundRole !== undefined) used.add(p.backgroundRole);
      }
      const unpaired = ROLES.filter((r) => !used.has(r)).sort();
      expect(unpaired).toEqual(['dangerBar', 'infoBar', 'okBar', 'rule', 'warnBar']);
    },
  );

  it('lists the pairs that Req 22.3 names: the gradients’ ends, the status pairs, the icons', () => {
    const labels = new Set(paletteFor(field).map((p) => p.label));
    for (const label of [
      'primaryInk on primary (gradient start)',
      'primaryInk on primary (gradient end)',
      'headerDim on header (gradient end)',
      'headerInk on header (gradient end)',
      'warnInk on warnTint',
      'okInk on card',
      'warnIcon on warnTint',
      'infoIcon on raised',
      'ruleStrong on card',
      'tabActive on tabBar',
    ]) {
      expect(labels.has(label), label).toBe(true);
    }
    // Instrument has no gradient: no pair for one.
    const instrumentLabels = new Set(paletteFor(instrument).map((p) => p.label));
    expect(instrumentLabels.has('primaryInk on primary (gradient end)')).toBe(false);
  });
});

describe('the measured numbers of Vigia design D25.1 (the roles the lead did not give)', () => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const c = (theme: Theme, a: keyof Theme['colours'], b: keyof Theme['colours']) =>
    r2(ratio(theme.colours[a], theme.colours[b]));

  it('Field: the status icons on their tint, card, bg and raised', () => {
    expect([
      c(field, 'warnIcon', 'warnTint'),
      c(field, 'warnIcon', 'card'),
      c(field, 'warnIcon', 'bg'),
      c(field, 'warnIcon', 'raised'),
    ]).toEqual([4.51, 5.02, 4.63, 4.38]);
    expect([
      c(field, 'dangerIcon', 'dangerTint'),
      c(field, 'dangerIcon', 'card'),
      c(field, 'dangerIcon', 'bg'),
      c(field, 'dangerIcon', 'raised'),
    ]).toEqual([4.89, 5.62, 5.19, 4.9]);
    expect([
      c(field, 'okIcon', 'okTint'),
      c(field, 'okIcon', 'card'),
      c(field, 'okIcon', 'bg'),
      c(field, 'okIcon', 'raised'),
    ]).toEqual([4.44, 5.13, 4.73, 4.47]);
    expect(c(field, 'infoIcon', 'infoTint')).toBe(7.3);
  });

  it('Field night: the lowest of each status icon', () => {
    const low = (
      icon: 'warnIcon' | 'dangerIcon' | 'okIcon' | 'infoIcon',
      tint: keyof Theme['colours'],
    ) => Math.min(...(['card', 'bg', 'raised', tint] as const).map((b) => c(fieldNight, icon, b)));
    expect(low('warnIcon', 'warnTint')).toBe(8.44);
    expect(low('dangerIcon', 'dangerTint')).toBe(6.56);
    expect(low('okIcon', 'okTint')).toBe(7.61);
    expect(low('infoIcon', 'infoTint')).toBe(7.54);
  });

  it('ruleStrong on bg, card, raised', () => {
    expect([
      c(field, 'ruleStrong', 'bg'),
      c(field, 'ruleStrong', 'card'),
      c(field, 'ruleStrong', 'raised'),
    ]).toEqual([3.52, 3.81, 3.32]);
    expect([
      c(fieldNight, 'ruleStrong', 'bg'),
      c(fieldNight, 'ruleStrong', 'card'),
      c(fieldNight, 'ruleStrong', 'raised'),
    ]).toEqual([4.72, 4.3, 3.78]);
  });

  it('the header and primary gradients’ ends, and the tab bar', () => {
    expect(r2(ratio(field.colours.headerDim, '#1B4372'))).toBe(7.5);
    expect(r2(ratio(fieldNight.colours.headerDim, '#173A66'))).toBe(7.85);
    expect(r2(ratio(field.colours.primaryInk, '#FFD24D'))).toBe(12.82);
    expect(r2(ratio(field.colours.primaryInk, '#FFB81F'))).toBe(10.67);
    expect([c(field, 'tabInk', 'tabBar'), c(field, 'tabActive', 'tabBar')]).toEqual([12.84, 9.29]);
    expect([c(fieldNight, 'tabInk', 'tabBar'), c(fieldNight, 'tabActive', 'tabBar')]).toEqual([
      15.62, 11.73,
    ]);
  });

  it('the lowest text pair is 7.27 in Field and 7.54 in Field night', () => {
    for (const [theme, expected] of [
      [field, 7.27],
      [fieldNight, 7.54],
    ] as const) {
      const text = paletteFor(theme).filter(
        (p) => p.minRatio === TEXT_MIN_RATIO && /^(ink|inkDim|accent|\w+Ink) on /.test(p.label),
      );
      expect(Math.min(...text.map((p) => ratio(p.foreground, p.background))).toFixed(2)).toBe(
        expected.toFixed(2),
      );
    }
  });
});
