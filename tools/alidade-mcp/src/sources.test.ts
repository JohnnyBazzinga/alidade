// Req 5.1: the server imports only the two skeleton packages, adds no dependency, and names nothing
// that opens a socket, reads a file, starts a process or reads the environment.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(SRC, '..');

/** The non-test TypeScript sources of the package, below src/ (a name with a dot is a file). */
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!name.includes('.')) return sources(path);
    const isSource =
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.testkit.ts') &&
      !name.endsWith('.d.ts');
    return isSource ? [path] : [];
  });
}

const FILES = sources(SRC);

const FORBIDDEN: readonly [string, RegExp][] = [
  ['fetch', /\bfetch\b/],
  ['http', /\bhttps?\b/],
  ['net', /\bnet\b/],
  ['dgram', /\bdgram\b/],
  ['dns', /\bdns\b/],
  ['fs', /\bfs\b/],
  ['child_process', /\bchild_process\b/],
  ['process.env', /process\.env/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['require(', /\brequire\(/],
  ['the MCP SDK', /@modelcontextprotocol/],
  ['a node: import', /from 'node:/],
  ['eval', /\beval\(|new Function\(/],
];

describe('the server sources (Req 5.1)', () => {
  it('finds the sources it is meant to scan', () => {
    const names = FILES.map((file) => relative(SRC, file));
    for (const expected of [
      'server.ts',
      'protocol.ts',
      'framing.ts',
      'tools/fix-from-bearings.ts',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it.each(FORBIDDEN)('never names %s', (_name, pattern) => {
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(pattern);
    }
  });

  it('imports only relative files and the two skeleton packages', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/from '([^']+)'/g)) {
        const specifier = match[1] ?? '';
        const allowed =
          specifier.startsWith('./') ||
          specifier.startsWith('../') ||
          specifier === '@alidade/core' ||
          specifier === '@alidade/sensors';
        expect(allowed, `${relative(SRC, file)} imports ${specifier}`).toBe(true);
      }
    }
  });

  it('names no browser global', () => {
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(
        /\b(window|document|navigator|localStorage)\b/,
      );
    }
  });

  it('adds no external dependency', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies).toStrictEqual({
      '@alidade/core': 'workspace:*',
      '@alidade/sensors': 'workspace:*',
    });
  });
});
