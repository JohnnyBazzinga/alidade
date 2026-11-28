// Nonius's look is Mira, the author's design of 2026-11-28 (skeleton-ui Req 22.14 as amended; Nonius
// Req 16.1): the entry applies it to the root before the first render, and no other theme; its two
// fonts are imported there, as Vigia imports them.

import { describe, expect, it } from 'vitest';

const MAIN = Object.values(
  import.meta.glob<string>('./main.tsx', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

describe('the entry applies Mira (skeleton-ui Req 22.14; Nonius Req 16.1)', () => {
  it('calls applyTheme with Mira on the root, before createRoot renders', () => {
    const apply = MAIN.indexOf('applyTheme(document.documentElement, mira)');
    expect(apply).toBeGreaterThan(-1);
    expect(apply).toBeLessThan(MAIN.indexOf('createRoot(root).render('));
  });

  it('applies no other theme', () => {
    expect(MAIN).not.toMatch(/\bfieldNight\b|\bfield\b(?!s)|\binstrument\b|watchColourScheme/);
  });

  it('imports Mira\u2019s two fonts, Sora and IBM Plex Mono', () => {
    expect(MAIN).toContain("import '@fontsource-variable/sora/wght.css';");
    expect(MAIN).toContain("import '@fontsource/ibm-plex-mono/latin-500.css';");
  });
});
