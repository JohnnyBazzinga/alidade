// The fixed sentences that say what can and cannot be checked at each count of used Sightings
// (Req 5.4, 5.5, design §7.7). A Sighting is never named here: with fewer than four used the app
// cannot say which one is off (Req 5.5).

import type { CheckLevel, Disagreement } from './assess';

const CHECK_STATEMENTS: Readonly<Record<CheckLevel, string>> = {
  none: 'No sighting yet: point the phone at the base of the smoke and sight it.',
  one: 'One sighting gives a direction, not a place.',
  two: 'Two sightings always cross somewhere, so they cannot check each other: a wrong one gives a wrong place and nothing on the screen can tell.',
  three:
    'Three sightings can show that they disagree, but not which one is off; a fourth sighting can.',
  four_or_more:
    'With four or more sightings the app sets aside one that does not agree with the others, by a statistical rule that can keep a wrong sighting and can set aside a good one; with only four or five sightings this happens more often.',
};

/** What the app can check with this many used Sightings (Req 5.4). */
export function checkStatement(level: CheckLevel): string {
  return CHECK_STATEMENTS[level];
}

const THREE_CANNOT_TELL =
  'The sightings do not agree: at least one is off, and three sightings cannot tell which one; a fourth sighting can.';
const DIVERGING_FOUR =
  'The lines do not meet in front of the observers, so at least one sighting is off; hide a sighting to see whether the others agree.';

/**
 * The sentence for a disagreement (Req 5.5), or `null` when there is none or the combination
 * cannot occur: `three_disagree` needs exactly three used, and `diverging` needs three or more.
 */
export function disagreementStatement(
  disagreement: Disagreement,
  level: CheckLevel,
): string | null {
  if (disagreement === 'three_disagree') return level === 'three' ? THREE_CANNOT_TELL : null;
  if (disagreement === 'diverging') {
    if (level === 'three') return THREE_CANNOT_TELL;
    if (level === 'four_or_more') return DIVERGING_FOUR;
  }
  return null;
}

/** The sentence beside the statement by count: two phones can disagree about what to set aside (Req 5.4). */
export function incidentStatement(): string {
  return 'Two phones can set different sightings aside when they joined this smoke at different times, so compare them if the places differ.';
}
