import { describe, expect, it } from 'vitest';
import { SIZES, SYSTEM_MONO } from './index';
// The page keeps Instrument's look, in hex: the components write roles (Req 22.2), a static page cannot.
import { INSTRUMENT_TOKENS as COLOURS } from './components/theme';

// The landing page of the published site, `site/index.html` at the repository root: one static
// page, inline CSS, no script and no request. It uses this package's palette and font stack so
// that it matches the apps, which is why its test lives here. The diagram it inlines is
// `docs/skeleton.svg`.

const PAGE = Object.values(
  import.meta.glob<string>('../../../site/index.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0];
const DIAGRAM = Object.values(
  import.meta.glob<string>('../../../docs/skeleton.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0];

const GITHUB = 'https://github.com/JohnnyBazzinga/alidade';

/** The `href` of every anchor, in document order. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\s[^>]*?href="([^"]*)"/g)].map((m) => m[1] ?? '');
}

/** Quotes unified (Prettier writes single ones), whitespace collapsed to single spaces, and none next to a tag bracket or a comma. */
function squash(text: string): string {
  return text
    .replace(/'/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/ ?([<>,]) ?/g, '$1');
}

/** The text of the page with tags removed and whitespace collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

describe('site/index.html', () => {
  const html = PAGE ?? '';

  it('exists and is a page', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Alidade</title>');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
  });

  it('has no script, no frame, no form and no event handler', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<(iframe|object|embed|form|link|base)\b/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it('makes no request: no src, no import, no url() and no address but the repository link', () => {
    expect(html).not.toMatch(/\ssrc\s*=/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/\sxlink:href|<use\b|<image\b/i);
    const addresses = html.match(/(?:https?:)?\/\/[^\s"'<>)]+/g) ?? [];
    // The SVG's own namespace is an identifier, not a request.
    const requests = addresses.filter((a) => a !== 'http://www.w3.org/2000/svg');
    expect(requests).toStrictEqual([GITHUB]);
  });

  it('has the five links, every one relative but the repository, and none from the root', () => {
    const all = hrefs(html);
    expect([...all].sort()).toStrictEqual(
      [GITHUB, 'nonius/', 'playground/', 'vigia/', 'vigia/?mode=simulator'].sort(),
    );
    for (const href of all) {
      if (href === GITHUB) continue;
      expect(href, href).not.toMatch(/^(?:[a-z]+:|\/)/i);
    }
  });

  it('names the two apps in the two large links, in the words of the brief', () => {
    expect(html).toMatch(
      /<a [^>]*href="vigia\/"[^>]*>[^<]*Vigia: locate smoke from several phones' sightings/,
    );
    expect(html).toMatch(
      /<a [^>]*href="nonius\/"[^>]*>[^<]*Nonius: find your position from the Sun/,
    );
  });

  it('says how to try each on a laptop, and the two honest lines', () => {
    const text = textOf(html);
    expect(text).toContain('vigia/?mode=simulator');
    expect(text).toMatch(/choose Simulator/i);
    expect(text).toContain('Every scene in the simulators is made up.');
    expect(text).toContain('Neither app calls or notifies anyone.');
  });

  it('carries the referrer policy of the apps', () => {
    expect(html).toContain('<meta name="referrer" content="strict-origin" />');
  });

  it('inlines the diagram of docs/skeleton.svg, unchanged', () => {
    expect(DIAGRAM).toBeDefined();
    const svg = (DIAGRAM ?? '').trim();
    expect(svg.startsWith('<svg')).toBe(true);
    // Prettier re-indents the page; the picture is the same once whitespace is collapsed.
    expect(squash(html)).toContain(squash(svg));
  });

  it('uses the palette and the numeric font stack of @alidade/ui, and no other colour', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).not.toBe('');
    // The page applies no theme, so it writes the system's monospace that the stack falls back to.
    expect(squash(style)).toContain(squash(SYSTEM_MONO));
    const allowed = new Set(Object.values(COLOURS).map((c) => c.toLowerCase()));
    const used = (style.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((c) => c.toLowerCase());
    expect(used.length).toBeGreaterThan(3);
    for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
    expect(style).toMatch(new RegExp(`background:\\s*${COLOURS.bg}`, 'i'));
  });

  it('reads from 320 to 1280 px: fluid width, wrapping text, no fixed width above 320 px', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).toMatch(/max-width:\s*\d+px/);
    expect(style).toMatch(/svg\s*\{[^}]*max-width:\s*100%[^}]*height:\s*auto/);
    expect(style).toMatch(/overflow-wrap:\s*anywhere/);
    for (const m of style.matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g))
      expect(Number(m[1]), m[0]).toBeLessThanOrEqual(320);
    // Body text at least 16 px; the large links' height at least the skeleton's touch target.
    expect(style).toMatch(/font-size:\s*(?:1[6-9]|[2-9]\d)px/);
    expect(style).toContain(`min-height: ${SIZES.touchPx}px`);
  });

  it('has no line of the diagram wider than its box, with a margin of 12 px', () => {
    const svg = DIAGRAM ?? '';
    const rects = [
      ...svg.matchAll(
        /<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/g,
      ),
    ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }));
    const lines = [...svg.matchAll(/<text\s+([^>]*)>([^<]*)<\/text>/g)].map((m) => {
      const attrs = m[1] ?? '';
      const num = (name: string): number =>
        Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(attrs)?.[1]);
      return {
        x: num('x'),
        y: num('y'),
        size: num('font-size'),
        middle: /text-anchor="middle"/.test(attrs),
        text: m[2] ?? '',
      };
    });
    expect(lines.length).toBeGreaterThan(15);
    const MARGIN_PX = 12;
    for (const line of lines) {
      expect(Number.isFinite(line.size), line.text).toBe(true);
      // A monospace glyph is about 0.6 em wide, the bold ones too.
      const widthPx = line.text.length * line.size * 0.6;
      const left = line.middle ? line.x - widthPx / 2 : line.x;
      const right = left + widthPx;
      const boxes = rects
        .filter((r) => line.x >= r.x && line.x <= r.x + r.w && line.y > r.y && line.y < r.y + r.h)
        .sort((a, b) => a.w * a.h - b.w * b.h);
      const box = boxes[0];
      expect(box, line.text).toBeDefined();
      if (!box) continue;
      expect(right, line.text).toBeLessThanOrEqual(box.x + box.w - MARGIN_PX);
      expect(left, line.text).toBeGreaterThanOrEqual(box.x + MARGIN_PX);
      expect(line.y, line.text).toBeLessThanOrEqual(box.y + box.h - 6);
    }
  });

  it('says what each app adds, and what the bearing model is', () => {
    const svg = DIAGRAM ?? '';
    expect(svg).not.toContain('adds: the bearing model');
    expect(svg).toContain("uses Core's bearing model;");
    expect(svg).toContain('adds sharing and incidents');
    expect(svg).toContain('adds Sun altitude model');
    expect(svg).toContain('and calibration');
    expect(svg).toContain('→ one unknown smoke');
    expect(svg).toContain('→ one unknown observer');
  });
});
