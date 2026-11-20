import { describe, expect, it } from 'vitest';
import { ageText, utcClockText, utcDateText, waitText } from './civil-time';

const MIN = 60_000;
const H = 3_600_000;
const DAY = 86_400_000;
// 2026-11-20T14:20:00Z, worked out by hand: 2026-01-01 is 20454 days after 1970-01-01, and
// 20 November is day 323 of the year (0-based 323), so 20777 days.
const T = 20_777 * DAY + 14 * H + 20 * MIN;

describe('utcClockText', () => {
  it('prints the UTC clock', () => {
    expect(utcClockText(T)).toBe('14:20 UTC');
    expect(utcClockText(0)).toBe('00:00 UTC');
    expect(utcClockText(DAY - 1)).toBe('23:59 UTC');
  });
  it('prints the clock of the own day for a time before 1970', () => {
    expect(utcClockText(-MIN)).toBe('23:59 UTC');
  });
  it('does not print NaN for a number that is not finite', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity])
      expect(utcClockText(bad)).toBe('--:-- UTC');
  });
});

describe('utcDateText', () => {
  it('prints day, month name and year in UTC', () => {
    expect(utcDateText(T)).toBe('20 Nov 2026');
    expect(utcDateText(0)).toBe('1 Jan 1970');
  });
  it('handles the leap day, the year end and a time before 1970', () => {
    expect(utcDateText(Date.UTC(2028, 1, 29, 23, 59))).toBe('29 Feb 2028');
    expect(utcDateText(Date.UTC(2028, 2, 1, 0, 0))).toBe('1 Mar 2028');
    expect(utcDateText(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe('31 Dec 2026');
    expect(utcDateText(Date.UTC(2027, 0, 1))).toBe('1 Jan 2027');
    expect(utcDateText(-1)).toBe('31 Dec 1969');
  });
  it('says so, in words, for a number that is not finite', () => {
    expect(utcDateText(Number.NaN)).toBe('date unknown');
  });
});

describe('ageText', () => {
  it('tells an age in minutes, hours and days', () => {
    expect(ageText(30_000)).toBe('less than a minute ago');
    expect(ageText(-5)).toBe('less than a minute ago');
    expect(ageText(5 * MIN)).toBe('5 min ago');
    expect(ageText(2 * H)).toBe('2 h ago');
    expect(ageText(2 * H + 5 * MIN)).toBe('2 h 5 min ago');
    expect(ageText(47 * H)).toBe('47 h ago');
    expect(ageText(9 * DAY)).toBe('9 days ago');
    expect(ageText(2 * DAY)).toBe('2 days ago');
  });
  it('does not print NaN', () => {
    expect(ageText(Number.NaN)).toBe('age unknown');
    expect(ageText(Infinity)).toBe('age unknown');
  });
});

describe('waitText (waits are rounded up to the step)', () => {
  const STEP = 5 * MIN;
  it('rounds up to the step', () => {
    expect(waitText(100 * MIN, STEP)).toBe('1 h 40 min');
    expect(waitText(100 * MIN + 1, STEP)).toBe('1 h 45 min');
    expect(waitText(1, STEP)).toBe('5 min');
    expect(waitText(40 * MIN, STEP)).toBe('40 min');
    expect(waitText(2 * H, STEP)).toBe('2 h');
  });
  it('gives the step as the least wait, and words for a bad argument', () => {
    expect(waitText(0, STEP)).toBe('5 min');
    expect(waitText(-10, STEP)).toBe('5 min');
    expect(waitText(Number.NaN, STEP)).toBe('a while');
    expect(waitText(MIN, 0)).toBe('a while');
    expect(waitText(MIN, Number.NaN)).toBe('a while');
  });
});
