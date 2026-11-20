import { describe, expect, it } from 'vitest';
import { defaultClock, defaultTimer } from './defaults';
import { views } from './test-support/source-views';

const SOURCE = Object.values(
  import.meta.glob<string>('./defaults.ts', { query: '?raw', import: 'default', eager: true }),
)[0];

describe('the constants of defaults.ts (Req 14.1)', () => {
  it('gives each exported constant a comment with its unit and its basis', () => {
    if (SOURCE === undefined) throw new Error('defaults.ts not read');
    const lines = SOURCE.split('\n');
    const constants = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /^export const [A-Z0-9_]+\s*[:=]/.test(line));
    expect(constants.length).toBeGreaterThanOrEqual(31);
    for (const { line, i } of constants) {
      let j = i - 1;
      while (j >= 0 && !lines[j]?.trim().startsWith('/**')) j -= 1;
      const comment = lines.slice(j, i).join(' ');
      expect(comment, line).toMatch(/Unit: /);
      expect(comment, line).toMatch(/Basis: /);
    }
  });

  it('holds no degree conversion factor of its own', () => {
    if (SOURCE === undefined) throw new Error('defaults.ts not read');
    expect(views(SOURCE).bare).not.toMatch(/Math\.PI\s*\/\s*180/);
  });
});

describe('the one module that reads time (Req 1.5)', () => {
  it('gives a Clock that returns a finite number of milliseconds near now', () => {
    const t = defaultClock();
    expect(Number.isFinite(t)).toBe(true);
    expect(Math.abs(t - Date.now())).toBeLessThan(1000);
  });

  it('gives a Timer that starts and stops a repeating callback', async () => {
    let count = 0;
    const handle = defaultTimer.start(() => {
      count += 1;
    }, 5);
    await new Promise((resolve) => setTimeout(resolve, 40));
    defaultTimer.stop(handle);
    const seen = count;
    expect(seen).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(count).toBe(seen);
  });
});
