// The built page (the lead's decision of 2026-11-21; skeleton-ui Req 15.18): it works when served
// from a sub-path of a static host, so every address in it is relative, and it carries the map
// library's worker file, which the first trial of the skeleton on a phone lacked (no map was
// drawn). The tile provider comes from the build environment: none is written in the source.
//
// The test builds the page with the configuration of `pnpm --filter @alidade/nonius build`
// (`vite.config.ts`) and reads the files the build produces, kept in memory (`write: false`), so
// that it never depends on an earlier build and writes nothing. `vite build` exits; nothing is
// served. It follows `skeleton/ui/playground/build-output.test.ts`.

import installedWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

/** An absolute path of a file of the package. */
const here = (name: string): string => decodeURIComponent(new URL(name, import.meta.url).pathname);

const WORKER = /^assets\/maplibre-gl-worker-[\w-]+\.mjs$/;
const TILE_HOST = 'tiles.provider.test';

type Files = Map<string, string>;

async function buildFiles(define: Record<string, string> = {}): Promise<Files> {
  const files: Files = new Map();
  const result = await build({
    configFile: here('../vite.config.ts'),
    root: here('..'),
    logLevel: 'silent',
    define,
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  for (const out of outputs) {
    if (!('output' in out)) throw new Error('the build did not return its output');
    for (const item of out.output) {
      const text =
        item.type === 'chunk'
          ? item.code
          : typeof item.source === 'string'
            ? item.source
            : new TextDecoder().decode(item.source);
      files.set(item.fileName, text);
    }
  }
  return files;
}

let plain: Files = new Map();
let withProvider: Files = new Map();

beforeAll(async () => {
  plain = await buildFiles();
  withProvider = await buildFiles({
    'import.meta.env.VITE_TILE_URL_TEMPLATE': JSON.stringify(
      `https://${TILE_HOST}/{z}/{x}/{y}.png`,
    ),
    'import.meta.env.VITE_TILE_ATTRIBUTION': JSON.stringify('Map data by the Provider'),
    'import.meta.env.VITE_TILE_SOURCE_NAME': JSON.stringify('Provider Maps'),
    'import.meta.env.VITE_TILE_TERMS_URL': JSON.stringify('https://provider.test/terms'),
  });
}, 300_000);

const scripts = (files: Files) => [...files.entries()].filter(([name]) => name.endsWith('.js'));

describe('the built page works from a sub-path and carries the map library’s worker', () => {
  // The worker keeps the installed file's `.mjs`; the build also writes a small `.js` chunk named
  // after it that holds only its address (the dynamic `?url` import of the loader).
  it("emits the map library's worker as a file of its own, unchanged", () => {
    const workers = [...plain.keys()].filter((name) => WORKER.test(name));
    expect(workers).toHaveLength(1);
    const [worker] = workers;
    if (worker === undefined) throw new Error('no worker');
    expect(plain.get(worker)).toBe(installedWorker);
  });

  it("refers to the worker from the page's script by a relative address only", () => {
    const path = [...plain.keys()].find((name) => WORKER.test(name));
    if (path === undefined) throw new Error('no worker');
    const worker = path.slice('assets/'.length);
    const referring = scripts(plain).filter(([, text]) => text.includes(worker));
    expect(referring.length).toBeGreaterThan(0);
    const escaped = worker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [, text] of referring) {
      const mentions = [...text.matchAll(new RegExp(`(["'\`])([^"'\`]*)${escaped}`, 'g'))];
      expect(mentions.length).toBeGreaterThan(0);
      // Every mention is a relative address: no `/` in front (a path from the site's root, such as
      // `/assets/…`) and no scheme.
      for (const m of mentions) expect(['', './', 'assets/', './assets/']).toContain(m[2] ?? '');
    }
  });

  it('loads its scripts and styles from the page by relative addresses', () => {
    const html = plain.get('index.html') ?? '';
    const sources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(s.startsWith('./')).toBe(true);
    expect(sources.some((s) => s.endsWith('.js'))).toBe(true);
    expect(sources.some((s) => s.endsWith('.css'))).toBe(true);
  });

  // Req 10.2 as amended on 2026-11-20 (the tile provider's policy, Open question O7): the page
  // sends its origin and nothing else as the referrer; the Network gate's own requests keep
  // `no-referrer` (adapters/network-gate.test.ts).
  it('gives the page the strict-origin referrer policy, once, and no other', () => {
    const page = plain.get('index.html') ?? '';
    expect(page).toMatch(/<meta name="referrer" content="strict-origin"\s*\/?>/);
    expect(page.match(/<meta name="referrer"/g)).toHaveLength(1);
    expect(page).not.toContain('no-referrer');
  });
});

describe('the tile provider comes from the build environment (Req 11.4)', () => {
  it('has no tile host in a build with no provider', () => {
    for (const [, text] of scripts(plain)) expect(text).not.toContain(TILE_HOST);
  });

  it('has the provider’s host, name and terms in a build that names one', () => {
    const all = scripts(withProvider)
      .map(([, text]) => text)
      .join('\n');
    expect(all).toContain(TILE_HOST);
    expect(all).toContain('Provider Maps');
    expect(all).toContain('https://provider.test/terms');
  });
});
