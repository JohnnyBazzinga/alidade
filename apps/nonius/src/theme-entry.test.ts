// Nonius's look is Instrument (skeleton-ui Req 22.14, task 35.8): the entry applies it to the root
// before the first render, and no other theme.

import { describe, expect, it } from 'vitest';

const MAIN = Object.values(
  import.meta.glob<string>('./main.tsx', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

describe('the entry applies Instrument (skeleton-ui Req 22.14)', () => {
  it('calls applyTheme with Instrument on the root, before createRoot renders', () => {
    const apply = MAIN.indexOf('applyTheme(document.documentElement, instrument)');
    expect(apply).toBeGreaterThan(-1);
    expect(apply).toBeLessThan(MAIN.indexOf('createRoot(root).render('));
  });

  it('applies no other theme', () => {
    expect(MAIN).not.toMatch(/\bfieldNight\b|\bfield\b(?!s)|watchColourScheme/);
  });
});
