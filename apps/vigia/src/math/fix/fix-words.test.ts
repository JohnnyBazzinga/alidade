import { describe, expect, it } from 'vitest';
import { fixOf } from '../../test-support/generators';
import { offsetFromOrigin, ORIGIN, PARAMETERS } from '../../test-support/incident-fixtures';
import { assessmentOfCase, fixOfCase, WORDS_FIXTURE } from '../../test-support/words-fixture';
import { fixWords, fixWordsText } from './fix-words';

const NOW = WORDS_FIXTURE.nowUtcMs;

describe('fixWords against the fixture (Req 6.2, 6.3, 6.7, design §7.8)', () => {
  for (const c of WORDS_FIXTURE.fixes) {
    it(`gives exactly the words of the fixture for ${c.name}`, () => {
      expect(fixWords(fixOfCase(c), assessmentOfCase(c), NOW, PARAMETERS)).toEqual({
        ok: true,
        value: c.fixWords,
      });
    });
  }
});

describe('fixWords: the rules of the words', () => {
  const c = WORDS_FIXTURE.fixes[1];
  if (c === undefined) throw new Error('fixture');

  it('holds none of the words that claim certainty, and says probably and within about (Req 6.3)', () => {
    for (const each of WORDS_FIXTURE.fixes) {
      const words = fixWords(fixOfCase(each), assessmentOfCase(each), NOW, PARAMETERS);
      if (!words.ok) throw new Error('failed');
      const text = fixWordsText(words.value);
      expect(text).not.toMatch(/exact|located at|confirmed|precisely/i);
      expect(text).toContain('Probably');
      expect(text).toContain('within about');
      expect(text).not.toMatch(/NaN|Infinity|undefined|null/);
    }
  });

  it('says the set-aside count only when there is one, and the excluded ones in the plural for two', () => {
    const third = WORDS_FIXTURE.fixes[2];
    if (third === undefined) throw new Error('fixture');
    const fix = { ...fixOfCase(third), excludedIds: ['222222229', '22222222A'] };
    const words = fixWords(fix, assessmentOfCase(third), NOW, PARAMETERS);
    expect(words.ok && words.value.warnings[1]).toBe(
      '2 sightings did not agree with the others and were set aside.',
    );
    const withOne = {
      ...assessmentOfCase(c),
      setAside: assessmentOfCase(third).setAside.slice(0, 1),
    };
    expect(fixWords(fixOfCase(c), withOne, NOW, PARAMETERS)).toMatchObject({
      ok: true,
      value: {
        basis: 'Based on 2 sightings (1 set aside); newest 1 min ago, oldest 1 h 1 min ago.',
      },
    });
  });

  it('warns, with the distance and its uncertainty, when the Fix is beyond the plausible range of the nearest observer (Req 5.8)', () => {
    const far = offsetFromOrigin(0, 120_000);
    const fix = fixOf(far, { semiMajorM: 4000, semiMinorM: 800, azimuthRad: 0 });
    const words = fixWords(fix, assessmentOfCase(c), NOW, PARAMETERS);
    if (!words.ok) throw new Error('failed');
    expect(words.value.warnings).toHaveLength(1);
    expect(words.value.warnings[0]).toMatch(
      /^The smoke would be about 120\.0 km from the nearest observer, give or take [\d.]+ km \(95 %\), beyond what a phone sighting can place\.$/,
    );
    // Within the range: no warning.
    expect(fixWords(fixOfCase(c), assessmentOfCase(c), NOW, PARAMETERS)).toMatchObject({
      ok: true,
      value: { warnings: [] },
    });
  });

  it('fails with Core\u2019s failure when the Ellipse cannot be scaled to 95 %', () => {
    const bad = fixOf(ORIGIN, { semiMajorM: 0, semiMinorM: 0, azimuthRad: 0 });
    expect(fixWords(bad, assessmentOfCase(c), NOW, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
    });
  });

  it('fails with insufficient_observations with fewer than two used Sightings', () => {
    const one = { ...assessmentOfCase(c), used: assessmentOfCase(c).used.slice(0, 1) };
    expect(fixWords(fixOfCase(c), one, NOW, PARAMETERS)).toEqual({
      ok: false,
      reason: 'insufficient_observations',
    });
  });

  it('fails for a time that is not finite and names a parameter that is not valid', () => {
    expect(fixWords(fixOfCase(c), assessmentOfCase(c), Number.NaN, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'nowUtcMs',
    });
    expect(
      fixWords(fixOfCase(c), assessmentOfCase(c), NOW, { ...PARAMETERS, longEllipseRatio: 1.2 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'longEllipseRatio',
    });
  });

  it('joins the parts into one text in order, the warnings after the geometry', () => {
    const third = WORDS_FIXTURE.fixes[2];
    if (third === undefined) throw new Error('fixture');
    const words = fixWords(fixOfCase(third), assessmentOfCase(third), NOW, PARAMETERS);
    if (!words.ok) throw new Error('failed');
    const w = third.fixWords;
    expect(fixWordsText(words.value)).toBe(
      [w.headline, w.area, w.basis, w.geometry, ...w.warnings, w.limits].join(' '),
    );
  });
});
