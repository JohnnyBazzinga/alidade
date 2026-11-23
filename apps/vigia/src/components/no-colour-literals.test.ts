// No colour literal in Vigia's source (skeleton-ui Req 22.6, Vigia Req 22.4, task 24.1): a component
// writes a role. The allowed files: the art's own constants (the plume's greys, D25.4) and the map's
// paints, which are drawn over the tiles in every theme (skeleton-ui Req 22.4: the map is not themed).

import { describe, expect, it } from 'vitest';

export function findColourLiterals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return (
    code.match(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(|\bhsla?\(/g) ?? []
  );
}

const GLOBBED = import.meta.glob<string>('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(GLOBBED).map(([key, source]) => [new URL(key, import.meta.url).pathname, source]),
);

const ALLOWED = [
  /\/components\/art\/art-colours\.ts$/,
  /\/math\/fix\/map-model\.ts$/,
  /\/overlays\/wind\/math\/wind-features\.ts$/,
];
const isTest = (path: string) => /\.test\.tsx?$/.test(path) || /\/test-support\//.test(path);

describe('the source of Vigia (skeleton-ui Req 22.6)', () => {
  const files = Object.entries(SOURCES).filter(
    ([path]) => !isTest(path) && !ALLOWED.some((re) => re.test(path)),
  );

  it('reads the source', () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it('has no colour literal outside the art’s constants and the map’s paints', () => {
    const found = files
      .map(([path, source]) => [path, findColourLiterals(source)] as const)
      .filter(([, literals]) => literals.length > 0)
      .map(([path, literals]) => `${path.replace(/^.*\/src\//, 'src/')}: ${literals.join(' ')}`);
    expect(found).toEqual([]);
  });

  it('bites: a literal planted in a copy of look.ts is found', () => {
    const look = files.find(([path]) => path.endsWith('/components/look.ts'))?.[1] ?? '';
    expect(look).not.toBe('');
    expect(findColourLiterals(`${look}\nconst planted = '#FFC233';`)).toEqual(['#FFC233']);
  });
});
