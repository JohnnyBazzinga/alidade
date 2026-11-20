// The README of the package (task 16.2, Req 10.7, 11.6, 15.3, 15.4, design D19, §13): it says what
// the app is, how to build it, the four build variables, how two people use it, what the wind layer
// sends, and, in two paragraphs, what the host of the page should do. Every claim that the code can
// check is checked against the code.

import { describe, expect, it } from 'vitest';
import { HOST_LIST, WIND_ENTRY } from './math/network/host-list';

const README = Object.values(
  import.meta.glob<string>('../README.md', { query: '?raw', import: 'default', eager: true }),
)[0];
const ENV_EXAMPLE = Object.values(
  import.meta.glob<string>('../.env.example', { query: '?raw', import: 'default', eager: true }),
)[0];

const text = README ?? '';

/** The text under the heading `## <title>`, up to the next heading of the same or a higher level. */
function section(title: string): string {
  const start = text.indexOf(`## ${title}\n`);
  if (start < 0) return '';
  const rest = text.slice(start + `## ${title}\n`.length);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

const paragraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && !p.startsWith('```') && !p.startsWith('- '));

describe('apps/vigia/README.md', () => {
  it('has the sections the task names', () => {
    for (const title of [
      'Build',
      "The map's tile provider",
      'Using it with another person',
      'Wind',
      'Hosting',
    ]) {
      expect(section(title), title).not.toBe('');
    }
  });

  it('names the four build variables of .env.example, exactly those', () => {
    const names = (ENV_EXAMPLE ?? '')
      .split('\n')
      .filter((l) => /^[A-Z][A-Z0-9_]*=$/.test(l))
      .map((l) => l.slice(0, -1));
    expect(names).toEqual([
      'VITE_TILE_URL_TEMPLATE',
      'VITE_TILE_ATTRIBUTION',
      'VITE_TILE_SOURCE_NAME',
      'VITE_TILE_TERMS_URL',
    ]);
    for (const name of names) expect(text, name).toContain(name);
    expect(text).not.toContain('two variables');
  });

  it('says in two sentences how two people use the app', () => {
    const body = section('Using it with another person');
    const sentences = body
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?]) /)
      .map((s) => s.trim())
      .filter((s) => s !== '');
    expect(sentences).toHaveLength(2);
    const joined = sentences.join(' ');
    expect(joined).toMatch(/each .*sight/i);
    expect(joined).toMatch(/link, (?:a )?QR code or (?:a )?text/);
    expect(joined).toMatch(/same smoke/);
  });

  it('says that the QR and the link need the receiving phone to load the page, and that the page must be opened once with a connection', () => {
    const flat = text.replace(/\s+/g, ' ');
    expect(flat).toMatch(/QR code and the link need the receiving phone to load the page/);
    expect(flat).toMatch(/opened once with a connection/);
    expect(flat).toMatch(/no service worker/);
  });

  it('has two paragraphs on hosting: the hosts the page contacts, and the headers the host should send', () => {
    const body = paragraphs(section('Hosting'));
    expect(body).toHaveLength(2);
    const [hosts = '', headers = ''] = body.map((p) => p.replace(/\s+/g, ' '));
    for (const entry of HOST_LIST) expect(hosts).toContain(entry.host);
    expect(hosts).toMatch(/tile provider/);
    expect(headers.indexOf('Referrer-Policy: no-referrer')).toBeGreaterThanOrEqual(0);
    expect(headers.indexOf('Referrer-Policy: no-referrer')).toBeLessThan(headers.indexOf('cache'));
    expect(headers).toMatch(/short cache lifetime for `index\.html`/);
    expect(headers).toMatch(/full request address/);
  });

  it('says what the wind layer sends, to whom and when, that it is off at start, and its terms', () => {
    const body = section('Wind').replace(/\s+/g, ' ');
    expect(body).toContain(WIND_ENTRY.host);
    expect(body).toMatch(/off when the page opens/);
    expect(body).toMatch(/rounded to 0\.1/);
    expect(body).toContain('CC BY 4.0');
    expect(body).toMatch(/non-commercial/);
  });

  it('names no host but the Host list\u2019s and the addresses of their terms', () => {
    const allowed = new Set<string>(HOST_LIST.map((e) => e.host));
    for (const entry of HOST_LIST) allowed.add(new URL(entry.termsUrl).hostname);
    const named = [...text.matchAll(/https?:\/\/([^/\s)`>:]+)/g)].map((m) => m[1] ?? '');
    for (const host of named) {
      // The synthetic examples of the tile variables end in `.test`.
      expect(allowed.has(host) || host.endsWith('.test'), host).toBe(true);
    }
  });

  it('points to the privacy document and promises no hosting document', () => {
    expect(text).toContain('docs/privacy.md');
    expect(text).not.toContain('hosting.md');
  });
});
