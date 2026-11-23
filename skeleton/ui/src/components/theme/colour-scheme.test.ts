// `watchColourScheme` (Req 22.5, task 35.3): from the current value, on every change, stoppable,
// with `matchMedia` as an argument and no global.

import { describe, expect, it } from 'vitest';
import { watchColourScheme } from './colour-scheme';

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const queries: string[] = [];
  const mql = {
    matches: initial,
    addEventListener: (_type: string, l: (e: { matches: boolean }) => void) => void listeners.add(l),
    removeEventListener: (_type: string, l: (e: { matches: boolean }) => void) =>
      void listeners.delete(l),
  };
  return {
    matchMedia: (q: string) => {
      queries.push(q);
      return mql;
    },
    set(value: boolean) {
      mql.matches = value;
      for (const l of [...listeners]) l({ matches: value });
    },
    listeners: () => listeners.size,
    queries,
  };
}

describe('watchColourScheme (Req 22.5)', () => {
  it('asks for prefers-color-scheme: dark, and calls onChange at once with the current value', () => {
    const light = fakeMatchMedia(false);
    const seen: boolean[] = [];
    watchColourScheme(light.matchMedia, (dark) => void seen.push(dark));
    expect(light.queries).toEqual(['(prefers-color-scheme: dark)']);
    expect(seen).toEqual([false]);
    const dark = fakeMatchMedia(true);
    const seen2: boolean[] = [];
    watchColourScheme(dark.matchMedia, (d) => void seen2.push(d));
    expect(seen2).toEqual([true]);
  });

  it('calls onChange on every change, with no reload', () => {
    const m = fakeMatchMedia(false);
    const seen: boolean[] = [];
    watchColourScheme(m.matchMedia, (dark) => void seen.push(dark));
    m.set(true);
    m.set(false);
    m.set(true);
    expect(seen).toEqual([false, true, false, true]);
  });

  it('stops on the returned function and leaves no listener', () => {
    const m = fakeMatchMedia(false);
    const seen: boolean[] = [];
    const stop = watchColourScheme(m.matchMedia, (dark) => void seen.push(dark));
    expect(m.listeners()).toBe(1);
    stop();
    expect(m.listeners()).toBe(0);
    m.set(true);
    expect(seen).toEqual([false]);
  });

  it('reads no global: it works where there is no window.matchMedia', () => {
    expect(Reflect.get(window, 'matchMedia')).toBeUndefined();
    const m = fakeMatchMedia(true);
    expect(() => watchColourScheme(m.matchMedia, () => undefined)).not.toThrow();
  });
});
