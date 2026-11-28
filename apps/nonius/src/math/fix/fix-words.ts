// The Fix's words, in the order of design §8.2 (Req 6.5 to 6.8, 8, 9.1 to 9.3, 9.7, 10.1, 10.2, 10.7).
// Every number reaches a sentence through `format.ts`.

import { ellipse95 } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { utcClockText, utcDateText } from '../civil-time';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { PreparedSight } from '../sight/prepare';
import { EARTH_RADIUS_M } from '../sphere/earth';
import type { Comparison } from './comparison';
import { adviceWords, nextSightAdvice, ruleOfThumb } from './advice';
import type { Assessment, Choice, Place, TwoPlacesWhy } from './assess';
import {
  axisWords,
  calibrationText,
  compassWord8,
  distanceText,
  lengthText95,
  nauticalText,
  positionText,
  sigmaDegText,
} from './format';
import { geometryClass, geometrySentence } from './geometry-class';
import { countStatement, disagreementStatement } from './statements';
import type { ShownFix } from './solve-candidate';
import { messageFor } from '../messages';

export type WordKind =
  | 'calibration'
  | 'start'
  | 'circle'
  | 'failure'
  | 'disagreement'
  | 'places'
  | 'place'
  | 'distance'
  | 'position'
  | 'axes'
  | 'choice'
  | 'count'
  | 'geometry'
  | 'advice'
  | 'rule'
  | 'limits';

export interface WordLine {
  readonly kind: WordKind;
  readonly text: string;
}

const line = (kind: WordKind, text: string): WordLine => ({ kind, text });

/** The place's circle of equal altitude with one sight (Req 9.7), in words. */
export function oneSightWords(
  sight: PreparedSight,
  params: NoniusParameters,
): NoniusResult<string> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const radiusM = (Math.PI / 2 - sight.observedGeometricAltitudeRad) * EARTH_RADIUS_M;
  const radius = lengthText95(radiusM);
  if (!radius.ok) return radius;
  // The point is printed to a tenth of a degree: the radius, not the point, is the uncertainty.
  const overhead = positionText(sight.subsolar, 12_000);
  if (!overhead.ok) return overhead;
  return ok(
    `With one sight you are somewhere on a circle of about ${radius.value.replace(/ km$/, '')} km radius around ${overhead.value.text}, where the Sun was overhead at ${utcClockText(sight.sight.timeUtcMs)}. A position needs a second sight.`,
  );
}

interface FixNumbers {
  readonly position: string;
  readonly radius: string;
  readonly axes: string;
}

function numbersOf(fix: ShownFix): NoniusResult<FixNumbers> {
  const e95 = ellipse95(fix.ellipse);
  if (!e95.ok) return err('invalid_number', { field: 'ellipse' });
  const { semiMajorM, semiMinorM, azimuthRad } = e95.value;
  const printed = positionText(fix.position, semiMinorM);
  if (!printed.ok) return printed;
  const radius = lengthText95(semiMajorM + printed.value.printBoundM);
  const radiusNm = nauticalText(semiMajorM + printed.value.printBoundM);
  const major = lengthText95(semiMajorM);
  const majorNm = nauticalText(semiMajorM);
  const minor = lengthText95(semiMinorM);
  const axis = axisWords(azimuthRad);
  if (!radius.ok || !radiusNm.ok || !major.ok || !majorNm.ok || !minor.ok || !axis.ok) {
    return err('invalid_number', { field: 'ellipse' });
  }
  return ok({
    position: printed.value.text,
    radius: `${radius.value} (${radiusNm.value})`,
    axes: `The 95 % area has semi-axes of about ${major.value} (${majorNm.value}) and ${minor.value}, the long axis running ${axis.value}.`,
  });
}

/** One of Two places in words (Req 6.7). */
export function placeWords(place: Place, params: NoniusParameters): NoniusResult<string> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const n = numbersOf(place.fix);
  if (!n.ok) return n;
  return ok(
    `Place ${place.label}: probably within about ${n.value.radius} of ${n.value.position}. ${n.value.axes}`,
  );
}

const WHY_WORDS: Record<TwoPlacesWhy, string> = {
  two_sights: 'two sights always cross twice',
  no_sun_side:
    'no usable compass reading was taken (none was taken, or the iPhone\u2019s compass does not work with the camera more than 30° up)',
  sun_side_undecided: 'the compass readings did not decide between them',
  equinox: 'near an equinox the Sun alone cannot tell a northern latitude from the southern one',
};

function choiceText(choice: Choice, used: readonly PreparedSight[]): NoniusResult<string | null> {
  switch (choice.kind) {
    case 'single':
      return ok('Both crossings of the circles led to this same place.');
    case 'other_failed':
      return ok('The other crossing of the circles gave no solution.');
    case 'fit': {
      const miss = (choice.worstMissRad * 180) / Math.PI;
      const compass = choice.compassDisagreedWithBoth
        ? ' The compass disagreed with both places and was not used.'
        : '';
      return ok(
        `Only this place fits all the sights; the other misses the worst one by ${miss.toFixed(1)}°.${compass}`,
      );
    }
    case 'sun_side': {
      const other = compassWord8(choice.otherAzimuthRad);
      const measured = compassWord8(choice.measuredTrueAzimuthRad);
      const distance = distanceText(choice.otherDistanceM);
      if (!other.ok) return other;
      if (!measured.ok) return measured;
      if (!distance.ok) return distance;
      const time = used.find((u) => u.sight.id === choice.sightId)?.sight.timeUtcMs;
      const at = time === undefined ? '' : ` at ${utcClockText(time)}`;
      return ok(
        `Chosen by the compass: at the other place, about ${distance.value} away, the Sun would have been to the ${other.value}${at}; your phone pointed ${measured.value}.`,
      );
    }
    case 'user': {
      const direction = compassWord8(choice.otherAzimuthRad);
      const distance = distanceText(choice.otherDistanceM);
      if (!direction.ok) return direction;
      if (!distance.ok) return distance;
      return ok(
        `You chose this place of two (${choice.label}). The other lies about ${distance.value} to the ${direction.value} of it.`,
      );
    }
  }
}

function limitsText(sigmaRad: number): NoniusResult<string> {
  const sigma = sigmaDegText(sigmaRad);
  if (!sigma.ok) return sigma;
  return ok(
    `The 95 % area holds only if every sight was of the Sun\u2019s centre, you did not move, the phone\u2019s clock was right and the errors are as stated. The phone\u2019s altitude sigma is ${sigma.value}°, and 1° of altitude is about 111 km (60 nautical miles) on the ground. Each minute of error in the phone\u2019s clock moves the position by up to 28 km east or west. No GPS was used for this position. Nonius is a backup and a teaching instrument, not navigation equipment.`,
  );
}

function countLine(a: Extract<Assessment, { used: readonly PreparedSight[] }>): string {
  const n = a.used.length;
  const aside = a.setAside.length > 0 ? `, ${a.setAside.length} set aside` : '';
  const times = a.used.map((u) => u.sight.timeUtcMs);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const span =
    n === 0 ? '' : ` from ${utcClockText(first)} to ${utcClockText(last)}, ${utcDateText(last)}`;
  return `${n} ${n === 1 ? 'sight' : 'sights'} used${aside}${span}. ${countStatement(n)}`;
}

/** How to start, before any sight: its first sentence is the Fix screen's title (Req 16.3). */
export const START =
  'Look only at the screen, never at the Sun. Tap Sight the Sun, put the crosshair on the centre of the Sun\u2019s glare and hold still. Take at least two sights about two hours apart, from one place.';

/**
 * A line's first sentence and the rest (Nonius Req 16.3): Mira draws a card's first sentence as its
 * title and the rest under it. The first sentence ends at the first full stop followed by a space;
 * a line with none is all head. Total over any string.
 */
export function leadAndRest(text: string): readonly [lead: string, rest: string] {
  const at = text.indexOf('. ');
  if (at < 0) return [text, ''];
  return [text.slice(0, at + 1), text.slice(at + 2)];
}

/**
 * The words of an Assessment, in order (design §8.2): the Calibration in use first; then, for a
 * Fix, the disagreement, the position, the axes, the choice, the count, the Geometry class and the
 * advice, and the limits last. Fails with the failure of the formatter for a number it cannot print.
 */
export function fixWords(
  assessment: Assessment,
  nowUtcMs: number,
  params: NoniusParameters,
): NoniusResult<readonly WordLine[]> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  const calibration = calibrationText(assessment.calibration, nowUtcMs, params);
  if (!calibration.ok) return calibration;
  const common =
    assessment.calibration.kind === 'index_error'
      ? assessment.calibration.indexError.sigmaRad
      : assessment.calibration.sigmaRad;
  const limits = limitsText(common);
  if (!limits.ok) return limits;
  const head = line('calibration', calibration.value);

  switch (assessment.kind) {
    case 'empty':
      return ok([head, line('start', START), line('rule', ruleOfThumb(params))]);
    case 'one': {
      const circle = oneSightWords(assessment.sight, params);
      if (!circle.ok) return circle;
      return ok([
        head,
        line('circle', circle.value),
        line('count', `1 sight used. ${countStatement(1)}`),
        line('rule', ruleOfThumb(params)),
      ]);
    }
    case 'failed': {
      const message = messageFor(assessment.failure);
      const out = [head, line('failure', `${message.whatHappened} ${message.whatToDo}`)];
      if (assessment.used.length > 0) out.push(line('count', countLine(assessment)));
      out.push(line('rule', ruleOfThumb(params)));
      return ok(out);
    }
    case 'two_places': {
      const a = placeWords(assessment.places[0], params);
      const b = placeWords(assessment.places[1], params);
      const apart = distanceText(assessment.distanceM);
      if (!a.ok) return a;
      if (!b.ok) return b;
      if (!apart.ok) return apart;
      const why = assessment.why.map((w) => WHY_WORDS[w]).join('; ');
      return ok([
        head,
        line('places', 'Two places fit these sights. Choose the one you are near.'),
        line('place', a.value),
        line('place', b.value),
        line('distance', `The two places are about ${apart.value} apart.`),
        line('choice', `They cannot be told apart because ${why}.`),
        line('count', countLine(assessment)),
        line('limits', limits.value),
      ]);
    }
    case 'fix': {
      const n = numbersOf(assessment.fix);
      if (!n.ok) return n;
      const choice = choiceText(assessment.choice, assessment.used);
      if (!choice.ok) return choice;
      const geometry = geometryClass(assessment.fix, params);
      if (!geometry.ok) return geometry;
      const out: WordLine[] = [head];
      const choiceLine = line('choice', choice.value ?? '');
      if (assessment.choice.kind === 'user') out.push(choiceLine);
      if (assessment.choice.kind === 'other_failed' && assessment.choice.compassDisagrees) {
        out.push(
          line(
            'disagreement',
            'The compass and the sights do not agree: check the compass, or take another sight.',
          ),
        );
      }
      const disagreement = disagreementStatement(assessment);
      if (disagreement !== null) out.push(line('disagreement', disagreement));
      out.push(
        line(
          'position',
          assessment.disagreement
            ? `The best fit of sights that disagree is ${n.value.position}.`
            : `Probably within about ${n.value.radius} of ${n.value.position}.`,
        ),
        line('axes', n.value.axes),
      );
      if (assessment.choice.kind !== 'user') out.push(choiceLine);
      out.push(line('count', countLine(assessment)));
      out.push(line('geometry', geometrySentence(geometry.value)));
      const advice = nextSightAdvice(assessment.fix.position, assessment.used, nowUtcMs, params);
      out.push(
        advice.ok
          ? line('advice', adviceWords(advice.value, assessment.used.length, params))
          : line('rule', ruleOfThumb(params)),
      );
      out.push(line('limits', limits.value));
      return ok(out);
    }
  }
}

/**
 * The Comparison in words (Req 11.3): the distance to the nearest step, the direction, and whether
 * the GPS position lies inside the 95 % area, with what each means. With an Index error in use it
 * says that the Index error was measured with this phone's GPS. `simulated` labels the position as
 * the scene's true one (Req 11.5).
 */
export function comparisonWords(
  comparison: Comparison,
  usesIndexError: boolean,
  simulated: boolean,
): NoniusResult<string> {
  const distance = distanceText(comparison.distanceM);
  const direction = compassWord8(comparison.azimuthRad);
  if (!distance.ok) return distance;
  if (!direction.ok) return direction;
  const source = simulated ? "the scene's true position (simulated)" : "this phone's GPS position";
  const where = comparison.inside
    ? 'It lies inside the 95 % area, which is expected about 19 times in 20.'
    : 'It lies outside the 95 % area. That happens about 1 time in 20 by chance, and more often means the sights carried more error than stated (the phone\u2019s altitude, a wrong clock, a move between sights).';
  const independent = usesIndexError
    ? ' The index error was measured with this phone\u2019s GPS, so a comparison at the place where it was measured is not wholly independent of the GPS.'
    : '';
  return ok(
    `${source[0]?.toUpperCase() ?? ''}${source.slice(1)} is about ${distance.value} to the ${direction.value} of the position from the sights. ${where}${independent}`,
  );
}
