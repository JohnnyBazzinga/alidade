import { describe, expect, it } from 'vitest';
import * as defaults from './defaults';

/** Source of defaults.ts, to read the comment of each constant (Req 19.1, 19.4). */
const SOURCE: string =
  Object.values(
    import.meta.glob<string>('./defaults.ts', { query: '?raw', import: 'default', eager: true }),
  )[0] ?? '';

/**
 * Each constant of Req 19.1 that the first release builds, with its value and the unit and basis
 * its comment must state (Req 19.4: measured, a skeleton threshold, or judgement). The values are
 * typed out here on purpose; the hotspot constants are the second release's and are not here.
 * None is measured and none is a skeleton threshold: all are the lead's proposals (open
 * question U4), to be revised by Device check V8.
 */
const EXPECTED = {
  MAX_INCIDENT_AGE_MS: { value: 30 * 60_000, unit: 'ms', basis: 'judgement' },
  INCIDENT_RETENTION_MS: { value: 24 * 3_600_000, unit: 'ms', basis: 'judgement' },
  CLOCK_SKEW_TOLERANCE_MS: { value: 2 * 60_000, unit: 'ms', basis: 'judgement' },
  MAX_SIGHTINGS_PER_INCIDENT: { value: 32, unit: 'count', basis: 'judgement' },
  PLAUSIBLE_RANGE_M: { value: 50_000, unit: 'm', basis: 'judgement' },
  LONG_ELLIPSE_RATIO: { value: 3, unit: 'ratio', basis: 'judgement' },
  FAIR_ELLIPSE_RATIO: { value: 1.5, unit: 'ratio', basis: 'judgement' },
  MAX_CODE_LENGTH_CHARS: { value: 2048, unit: 'chars', basis: 'judgement' },
  MAX_LINK_LENGTH_CHARS: { value: 160, unit: 'chars', basis: 'judgement' },
  MAX_EMERGENCY_TEXT_CHARS: { value: 900, unit: 'chars', basis: 'judgement' },
  ADVICE_MIN_DISTANCE_M: { value: 300, unit: 'm', basis: 'judgement' },
  EXPIRY_CHECK_INTERVAL_MS: { value: 60_000, unit: 'ms', basis: 'judgement' },
  WIND_GRID_DEG: { value: 0.1, unit: 'deg', basis: 'judgement' },
  MAX_WIND_AGE_MS: { value: 3 * 3_600_000, unit: 'ms', basis: 'judgement' },
  MAX_RESPONSE_BYTES: { value: 1_000_000, unit: 'bytes', basis: 'judgement' },
  REQUEST_TIMEOUT_MS: { value: 10_000, unit: 'ms', basis: 'judgement' },
  SIMULATION_TAP_SIGMA_PX: { value: 3, unit: 'px', basis: 'judgement' },
} as const;

describe('defaults (Req 19.1)', () => {
  it('exports exactly the 17 constants of the first release, with the values of Req 19.1', () => {
    expect(Object.keys(defaults).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [name, { value }] of Object.entries(EXPECTED)) {
      expect(Reflect.get(defaults, name), name).toBe(value);
    }
  });

  it('has no hotspot constant: they come with the hotspot Overlay (second release)', () => {
    expect(Object.keys(defaults).filter((name) => name.includes('HOTSPOT'))).toEqual([]);
  });

  describe('comments (Req 19.1, 19.4)', () => {
    for (const [name, { unit, basis }] of Object.entries(EXPECTED)) {
      it(`${name} is documented with its unit (${unit}), its reason and its basis (${basis})`, () => {
        const at = SOURCE.indexOf(`export const ${name} =`);
        expect(at, 'the constant is exported with `export const`').toBeGreaterThan(0);
        const end = SOURCE.lastIndexOf('*/', at);
        const start = SOURCE.lastIndexOf('/**', end);
        expect(start, 'a /** comment sits right above').toBeGreaterThanOrEqual(0);
        // Nothing but whitespace between the comment and the constant.
        expect(SOURCE.slice(end + 2, at).trim()).toBe('');
        const comment = SOURCE.slice(start, end + 2);
        expect(comment).toContain(`Unit: ${unit}.`);
        expect(comment).toContain(`Basis: ${basis}`);
        const reason = comment
          .slice(0, comment.indexOf('Unit:'))
          .replace(/[/*\s]+/g, ' ')
          .trim();
        expect(reason.length, 'a reason before the unit').toBeGreaterThanOrEqual(40);
      });
    }
  });
});
