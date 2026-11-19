import { describe, expect, it } from 'vitest';
import { checkStatement, disagreementStatement, incidentStatement } from './statements';

describe('checkStatement (Req 5.4, design §7.7): what can and cannot be checked at each count', () => {
  it('has the sentence of design §7.7 for each level', () => {
    expect(checkStatement('none')).toBe(
      'No sighting yet: point the phone at the base of the smoke and sight it.',
    );
    expect(checkStatement('one')).toBe('One sighting gives a direction, not a place.');
    expect(checkStatement('two')).toBe(
      'Two sightings always cross somewhere, so they cannot check each other: a wrong one gives a wrong place and nothing on the screen can tell.',
    );
    expect(checkStatement('three')).toBe(
      'Three sightings can show that they disagree, but not which one is off; a fourth sighting can.',
    );
    expect(checkStatement('four_or_more')).toBe(
      'With four or more sightings the app sets aside one that does not agree with the others, by a statistical rule that can keep a wrong sighting and can set aside a good one.',
    );
  });

  it('says for two that they cannot check each other, for three that the culprit is unknown, and for four the limits of the rule', () => {
    expect(checkStatement('two')).toContain('cannot check each other');
    expect(checkStatement('three')).toContain('not which one is off');
    expect(checkStatement('four_or_more')).toContain('can keep a wrong sighting');
    expect(checkStatement('four_or_more')).toContain('can set aside a good one');
  });

  it('is a different sentence for each level', () => {
    const all = (['none', 'one', 'two', 'three', 'four_or_more'] as const).map(checkStatement);
    expect(new Set(all).size).toBe(5);
  });
});

describe('disagreementStatement (Req 5.5)', () => {
  it('says that three sightings that disagree cannot tell which one is off, and that a fourth can', () => {
    const sentence =
      'The sightings do not agree: at least one is off, and three sightings cannot tell which one; a fourth sighting can.';
    expect(disagreementStatement('three_disagree', 'three')).toBe(sentence);
    expect(disagreementStatement('diverging', 'three')).toBe(sentence);
  });

  it('says that diverging lines of four or more mean that one is off, and offers to hide one', () => {
    expect(disagreementStatement('diverging', 'four_or_more')).toBe(
      'The lines do not meet in front of the observers, so at least one sighting is off; hide a sighting to see whether the others agree.',
    );
  });

  it('has no sentence when there is no disagreement', () => {
    for (const level of ['none', 'one', 'two', 'three', 'four_or_more'] as const) {
      expect(disagreementStatement('none', level)).toBeNull();
    }
  });

  it('names no Sighting, and promises no second Fix (Req 5.5)', () => {
    for (const level of ['three', 'four_or_more'] as const) {
      for (const d of ['three_disagree', 'diverging'] as const) {
        const sentence = disagreementStatement(d, level) ?? '';
        expect(sentence).not.toMatch(/sighting \d|this sighting|that sighting/i);
        expect(sentence).not.toMatch(/\bwithout\b/i);
      }
    }
  });

  it('gives no sentence for a combination that cannot occur', () => {
    expect(disagreementStatement('three_disagree', 'two')).toBeNull();
    expect(disagreementStatement('diverging', 'none')).toBeNull();
    expect(disagreementStatement('diverging', 'two')).toBeNull();
  });
});

describe('incidentStatement (Req 5.4)', () => {
  it('says that two phones can set different sightings aside when they joined at different times', () => {
    expect(incidentStatement()).toBe(
      'Two phones can set different sightings aside when they joined this smoke at different times, so compare them if the places differ.',
    );
  });
});
