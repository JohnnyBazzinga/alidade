// The built Playground carries the map library's worker (Req 15.18, amendment of 2026-11-19).
//
// The test builds the page with the configuration of `build:playground` (`playground/vite.config.ts`)
// and reads the files the build produces, kept in memory (`write: false`), so that it never depends
// on an earlier build and writes nothing. `vite build` exits; nothing is served.

import installedWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

/** An absolute path of a file beside this one. */
const here = (name: string): string => decodeURIComponent(new URL(name, import.meta.url).pathname);

const WORKER = /^assets\/maplibre-gl-worker-[\w-]+\.mjs$/;

/** File name (relative to the output folder) to its text. */
const files = new Map<string, string>();

beforeAll(async () => {
  const result = await build({
    configFile: here('./vite.config.ts'),
    root: here('.'),
    logLevel: 'silent',
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
}, 120_000);

describe('the built Playground (Req 15.18)', () => {
  // The worker keeps the installed file's `.mjs`; the build also writes a small `.js` chunk named
  // after it that holds only its address (the dynamic `?url` import of the loader).
  it("emits the map library's worker as a file of its own, unchanged", () => {
    const workers = [...files.keys()].filter((name) => WORKER.test(name));
    expect(workers).toHaveLength(1);
    const [worker] = workers;
    if (worker === undefined) throw new Error('no worker');
    expect(files.get(worker)).toBe(installedWorker);
  });

  it("refers to the worker from the page's script by a relative address only", () => {
    const path = [...files.keys()].find((name) => WORKER.test(name));
    if (path === undefined) throw new Error('no worker');
    const worker = path.slice('assets/'.length);
    const referring = [...files.entries()].filter(
      ([name, text]) => name.endsWith('.js') && text.includes(worker),
    );
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
    const html = files.get('index.html') ?? '';
    const sources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(s.startsWith('./')).toBe(true);
  });
});
