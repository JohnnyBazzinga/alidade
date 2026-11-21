import { describe, expect, it } from 'vitest';
import { COLOURS, FONT_STACK, SIZES } from './index';

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

  it('uses the palette and the font stack of @alidade/ui, and no other colour', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).not.toBe('');
    expect(squash(style)).toContain(squash(FONT_STACK));
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
});
