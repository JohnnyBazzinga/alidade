// What the sights can and cannot check (Req 8.1 to 8.3, design §8.2): words that depend on the
// count and on the assessment, and name no Sight.

import { OUTLIER_STUDENTISED_RESIDUAL } from '@alidade/core';
import type { Assessment } from './assess';

/**
 * What a set of `n` used Sights can check (Req 8.1). With one there is a circle and no position;
 * with two the circles cross twice and the two sights cannot check each other; with three they can
 * be seen to disagree, but not which one is off; with four or more Core sets aside a sight whose
 * Studentised residual exceeds its threshold, a statistical rule that can keep a wrong sight or
 * set aside a good one, more often with four or five. Never names a Sight.
 */
export function countStatement(n: number): string {
  if (!Number.isInteger(n) || n < 0) return 'The number of sights could not be told.';
  if (n === 0) return 'There is no sight yet.';
  if (n === 1) return 'One sight gives a circle, not a position.';
  if (n === 2) {
    return 'Two sights cross at two places, and two sights cannot check each other: a wrong one gives a wrong place and nothing on the screen can tell.';
  }
  if (n === 3) {
    return 'With three sights, they can be seen to disagree, but not which one is off.';
  }
  const rule = `With ${n} sights, a sight is set aside when its Studentised residual exceeds ${OUTLIER_STUDENTISED_RESIDUAL}. That is a statistical rule: it can keep a wrong sight or set aside a good one`;
  return n <= 5 ? `${rule}, more often with four or five.` : `${rule}.`;
}

/**
 * The words that begin the Fix when exactly three sights disagree (Req 8.2), or `null`: the sights
 * do not agree, at least one is off (a reflection, the wrong light, a moved phone, a wrong clock),
 * three cannot tell which and a fourth can; the position is the best fit of sights that disagree,
 * and the 95 % area may not contain the observer. No Sight is named (Req 8.3).
 */
export function disagreementStatement(assessment: Assessment): string | null {
  if (assessment.kind !== 'fix' || !assessment.disagreement) return null;
  return 'The sights do not agree: at least one is off (a reflection, the wrong light, a moved phone, a wrong clock). Three sights cannot tell which one, and a fourth can. This position is the best fit of sights that disagree, and the 95 % area may not contain you.';
}
