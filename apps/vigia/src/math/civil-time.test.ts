import { describe, expect, it } from 'vitest';
import { ageText, clockTextUtc } from './civil-time';

describe('clockTextUtc (Req 3.6, 14.1, design §7.1)', () => {
  it('writes the hours and minutes of the UTC day', () => {
    expect(clockTextUtc(1_790_000_000_000)).toBe('14:13 UTC');
  });

  it('pads to two digits and turns over at midnight', () => {
    expect(clockTextUtc(0)).toBe('00:00 UTC');
    expect(clockTextUtc(60_000 * 5)).toBe('00:05 UTC');
    expect(clockTextUtc(9 * 3_600_000 + 7 * 60_000)).toBe('09:07 UTC');
    expect(clockTextUtc(86_399_999)).toBe('23:59 UTC');
    expect(clockTextUtc(86_400_000)).toBe('00:00 UTC');
    expect(clockTextUtc(86_400_000 + 59_999)).toBe('00:00 UTC');
    expect(clockTextUtc(86_400_000 + 60_000)).toBe('00:01 UTC');
  });

  it('is the same for any day: 14:13 on the day of the example and on every day before and after', () => {
    for (const days of [-1000, -1, 1, 7, 365, 20_000]) {
      expect(clockTextUtc(1_790_000_000_000 + days * 86_400_000)).toBe('14:13 UTC');
    }
  });

  it('reads a time before 1970 as the clock of that day, not a negative one', () => {
    expect(clockTextUtc(-1)).toBe('23:59 UTC');
    expect(clockTextUtc(-60_000)).toBe('23:59 UTC');
    expect(clockTextUtc(-86_400_000)).toBe('00:00 UTC');
  });

  it('writes a placeholder, never NaN, for a time that is not finite', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity])
      expect(clockTextUtc(bad)).toBe('--:-- UTC');
  });

  it('stays in the format for huge times', () => {
    for (const big of [1e15, 1e300, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      expect(clockTextUtc(big)).toMatch(/^(?:[01]\d|2[0-3]):[0-5]\d UTC$/);
    }
  });
});

describe('ageText (design §7.1)', () => {
  it('says less than a minute below 60 000 ms, and for an age below zero', () => {
    expect(ageText(0)).toBe('less than a minute ago');
    expect(ageText(59_999)).toBe('less than a minute ago');
    expect(ageText(-1)).toBe('less than a minute ago');
    expect(ageText(-86_400_000)).toBe('less than a minute ago');
  });

  it('counts whole minutes from 60 000 ms up to an hour', () => {
    expect(ageText(60_000)).toBe('1 min ago');
    expect(ageText(119_999)).toBe('1 min ago');
    expect(ageText(120_000)).toBe('2 min ago');
    expect(ageText(3_599_999)).toBe('59 min ago');
  });

  it('counts hours, and the minutes only when there are some, up to 48 hours', () => {
    expect(ageText(3_600_000)).toBe('1 h ago');
    expect(ageText(3_600_000 + 59_999)).toBe('1 h ago');
    expect(ageText(3_600_000 + 60_000)).toBe('1 h 1 min ago');
    expect(ageText(5_400_000)).toBe('1 h 30 min ago');
    expect(ageText(7_200_000)).toBe('2 h ago');
    expect(ageText(172_799_999)).toBe('47 h 59 min ago');
  });

  it('counts whole days from 48 hours', () => {
    expect(ageText(172_800_000)).toBe('2 days ago');
    expect(ageText(172_800_000 + 86_399_999)).toBe('2 days ago');
    expect(ageText(259_200_000)).toBe('3 days ago');
    expect(ageText(30 * 86_400_000)).toBe('30 days ago');
  });

  it('says the age is unknown, never NaN, for an age that is not finite', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) expect(ageText(bad)).toBe('age unknown');
  });

  it('stays a sentence fragment with no NaN or infinity for huge ages', () => {
    for (const big of [1e15, 1e300, Number.MAX_VALUE]) {
      expect(ageText(big)).toMatch(/^[\d.]+(?:e\+\d+)? days ago$/);
      expect(ageText(big)).not.toMatch(/NaN|Infinity/);
    }
  });
});
