// The map's attribution, read clearly (task 31 continued; Req 15.2 as amended on 2026-11-20): dark
// text of the palette on an opaque light strip, links in the same colour and underlined, and the
// height of the strip that the fit keeps clear at the bottom of the map.

import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { hexToRgb } from '../../components/theme';
import { MIN_CONTRAST_RATIO } from '../../defaults';
import {
  ATTRIBUTION_BACKGROUND,
  ATTRIBUTION_FONT_PX,
  ATTRIBUTION_LINE_HEIGHT_PX,
  ATTRIBUTION_PADDING_Y_PX,
  ATTRIBUTION_RESERVED_LINES,
  ATTRIBUTION_STRIP_PX,
  ATTRIBUTION_TEXT,
  attributionCss,
} from './attribution-style';
import { MAP_DARK, MAP_LIGHT } from './map-style';

const ratio = (fg: string, bg: string): number => {
  const r = contrastRatio(hexToRgb(fg), hexToRgb(bg));
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries(
    body
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d !== '')
      .map((d) => {
        const colon = d.indexOf(':');
        return [d.slice(0, colon).trim(), d.slice(colon + 1).trim()];
      }),
  );
}

describe('the attribution style (Req 15.2)', () => {
  const css = attributionCss('alidade-map');
  const strip = rule(css, '.alidade-map .maplibregl-ctrl.maplibregl-ctrl-attrib');
  const links = rule(css, '.alidade-map .maplibregl-ctrl.maplibregl-ctrl-attrib a');

  it('is dark text of the palette on an opaque light strip, at least 7:1', () => {
    expect(ATTRIBUTION_TEXT).toBe(MAP_DARK);
    expect(ATTRIBUTION_BACKGROUND).toBe(MAP_LIGHT);
    expect(ratio(ATTRIBUTION_TEXT, ATTRIBUTION_BACKGROUND)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO,
    );
    expect(strip['color']).toBe(`${ATTRIBUTION_TEXT} !important`);
    expect(strip['background-color']).toBe(`${ATTRIBUTION_BACKGROUND} !important`);
    // Opaque: a six-digit hex, no alpha, no hsla or rgba, no opacity below 1.
    expect(strip['background-color']).toMatch(/^#[0-9A-F]{6} !important$/i);
    expect(strip['opacity']).toBe('1 !important');
  });

  it('gives the links the same colour, underlined, so that they read as links without colour', () => {
    expect(links['color']).toBe(`${ATTRIBUTION_TEXT} !important`);
    expect(links['text-decoration']).toBe('underline !important');
  });

  it('sets its own size and line height, so that the strip\u2019s height is the skeleton\u2019s number', () => {
    expect(strip['font-size']).toBe(`${ATTRIBUTION_FONT_PX}px !important`);
    expect(strip['line-height']).toBe(`${ATTRIBUTION_LINE_HEIGHT_PX}px !important`);
    expect(strip['padding']).toBe(`${ATTRIBUTION_PADDING_Y_PX}px 6px !important`);
  });

  it('reserves two lines of the strip and its padding: 2 \u00d7 20 + 2 \u00d7 2 = 44 px', () => {
    expect(ATTRIBUTION_RESERVED_LINES).toBe(2);
    expect(ATTRIBUTION_STRIP_PX).toBe(
      ATTRIBUTION_RESERVED_LINES * ATTRIBUTION_LINE_HEIGHT_PX + 2 * ATTRIBUTION_PADDING_Y_PX,
    );
    expect(ATTRIBUTION_STRIP_PX).toBe(44);
  });

  it('is scoped to the class it is given and holds no URL, no import and no markup', () => {
    for (const selector of css.match(/^[^{}]+(?=\{)/gm) ?? []) {
      expect(selector.trim().startsWith('.alidade-map ')).toBe(true);
    }
    expect(css).not.toMatch(/url\(|@import|<|>/);
    expect(attributionCss('other')).toContain('.other .maplibregl-ctrl.maplibregl-ctrl-attrib {');
  });

  it('refuses a scope that is not a plain class name (it goes into a stylesheet)', () => {
    for (const bad of ['', 'a b', 'a{', '1a', 'a;b', '.a']) {
      expect(() => attributionCss(bad), bad).toThrow();
    }
  });
});
