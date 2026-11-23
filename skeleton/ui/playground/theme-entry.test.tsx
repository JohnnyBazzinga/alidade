// The Playground's look is Instrument (Req 22.14, task 35.8): its entry applies it to the root before
// the first render. (Its stylesheet reads the roles too; the test runner empties a stylesheet read as
// text, so that is checked by the review, not here.)

import { describe, expect, it } from 'vitest';

const raw = (glob: Record<string, string>) => Object.values(glob)[0] as string;
const MAIN = raw(
  import.meta.glob<string>('./main.tsx', { query: '?raw', import: 'default', eager: true }),
);

describe('the Playground applies Instrument (Req 22.14)', () => {
  it('calls applyTheme with Instrument on the root, before the first render', () => {
    const apply = MAIN.indexOf('applyTheme(document.documentElement, instrument)');
    expect(apply).toBeGreaterThan(-1);
    expect(apply).toBeLessThan(MAIN.indexOf('createRoot('));
  });
});
