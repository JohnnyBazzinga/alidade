// No colour literal outside the theme files (Req 22.6, task 35.3): a component writes a role. The
// scanner is a function, tested on samples, and run over the package's source.

import { describe, expect, it } from 'vitest';

/** The colour literals in a source text, comments left out. */
export function findColourLiterals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return code.match(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(|\bhsla?\(/g) ?? [];
}

const SOURCES = {
  ...import.meta.glob<string>('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../../../playground/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
};

/** The files that may hold a colour: the theme's own, and the map's constants (Req 22.6). */
const ALLOWED = [/\/components\/theme\//, /\/components\/theme\.ts$/, /\/math\/map\/map-style\.ts$/];
const isTest = (path: string) => /\.test\.tsx?$/.test(path) || /\/test-support\//.test(path);

describe('findColourLiterals', () => {
  it('finds a #rgb, a #rrggbb, a #rrggbbaa, rgb( , rgba( and hsl(', () => {
    for (const sample of ["color: '#fff'", "x = '#0C0F12'", "'#0C0F1280'", 'rgb(1, 2, 3)', 'rgba(0,0,0,.5)', 'hsl(1 2% 3%)']) {
      expect(findColourLiterals(sample), sample).toHaveLength(1);
    }
  });
  it('leaves a comment and a URL fragment alone', () => {
    expect(findColourLiterals('// the brass #E3AE45\nconst a = 1;')).toEqual([]);
    expect(findColourLiterals('/* #E3AE45 */ const a = 1;')).toEqual([]);
    expect(findColourLiterals("href = 'https://x.test/#section'")).toEqual([]);
  });
});

describe('the source of the UI (Req 22.6)', () => {
  const files = Object.entries(SOURCES).filter(
    ([path]) => !isTest(path) && !ALLOWED.some((re) => re.test(path)),
  );

  it('reads the source, so that the scan is not empty', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('has no colour literal outside the theme files and the map’s constants', () => {
    const found = files
      .map(([path, source]) => [path, findColourLiterals(source)] as const)
      .filter(([, literals]) => literals.length > 0)
      .map(([path, literals]) => `${path}: ${literals.join(' ')}`);
    expect(found).toEqual([]);
  });

  it('fails when a literal is planted in a copy of a component', () => {
    const [, source] = files.find(([path]) => path.endsWith('/components/Reticle.tsx')) ?? ['', ''];
    expect(source).not.toBe('');
    expect(findColourLiterals(`${source}\nconst planted = '#123456';`)).toEqual(['#123456']);
  });
});
