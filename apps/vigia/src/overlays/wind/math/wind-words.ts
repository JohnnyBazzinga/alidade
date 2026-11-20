// The wind in words (design §7.16, Req 13.3, 13.4, 13.7): the direction it blows FROM with the
// compass word, the speed with its unit, the time it is valid for and its age; a forecast or an
// old reading said as such exactly when the time is more than `maxWindAgeMs` from now; and that
// the value is a model's, at one point and one time, which predicts no spread of fire. The Source's
// attribution is shown by the Overlay's Sources list, not repeated here.

import { ageText, clockTextUtc } from '../../../math/civil-time';
import { toDeg } from '../../../math/degrees';
import { compassWord8 } from '../../../math/fix/format';
import { checkParameters, type VigiaParameters } from '../../../math/parameters';
import { err, ok, type VigiaResult } from '../../../result';
import type { WindReading } from './wind-parse';

/** Req 13.4: what the wind value is, and is not. */
export const WIND_MODEL_SENTENCE =
  'It is a model value at one point and one time; smoke may lean or rise differently, and this app does not predict the spread of a fire.';

/** Req 13.7: the Source's terms, which the Sources list below the reading gives. */
export const WIND_TERMS_SENTENCE =
  'The service allows free use for non-commercial purposes only; its terms are listed below.';

export type WindTiming = 'current' | 'old' | 'forecast';

/**
 * `old` when the reading is valid for a time more than `maxWindAgeMs` before now, `forecast` when
 * more than that after it, else `current`. A time that is not a number is `current`: the words
 * refuse it before they use it.
 */
export function windTiming(
  validUtcMs: number,
  nowUtcMs: number,
  parameters: VigiaParameters,
): WindTiming {
  if (validUtcMs < nowUtcMs - parameters.maxWindAgeMs) return 'old';
  if (validUtcMs > nowUtcMs + parameters.maxWindAgeMs) return 'forecast';
  return 'current';
}

const MS_PER_MINUTE = 60_000;

/** "5 min ago" for a time in the past; "in 3 h" for one more than a minute ahead. */
function relativeText(validUtcMs: number, nowUtcMs: number): string {
  const behindMs = nowUtcMs - validUtcMs;
  if (behindMs >= -MS_PER_MINUTE) return ageText(Math.max(behindMs, 0));
  return `in ${ageText(-behindMs).replace(/ ago$/, '')}`;
}

/**
 * The sentences about `reading` at `nowUtcMs`. Fails with `invalid_number` naming a parameter, or
 * `directionFromRad`, `speedMs`, `validUtcMs`, `nowUtcMs` for a number that is not usable.
 */
export function windWords(
  reading: WindReading,
  nowUtcMs: number,
  parameters: VigiaParameters,
): VigiaResult<readonly string[]> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!Number.isFinite(reading.directionFromRad)) {
    return err('invalid_number', { field: 'directionFromRad' });
  }
  if (!Number.isFinite(reading.speedMs) || reading.speedMs < 0) {
    return err('invalid_number', { field: 'speedMs' });
  }
  if (!Number.isFinite(reading.validUtcMs)) return err('invalid_number', { field: 'validUtcMs' });
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });

  const word = compassWord8(reading.directionFromRad);
  if (!word.ok) return word;
  const directionDeg = toDeg(reading.directionFromRad);
  if (!directionDeg.ok) return directionDeg;
  // 359.6 degrees prints as 0 and never as 360.
  const wholeDeg = Math.round(((directionDeg.value % 360) + 360) % 360) % 360;
  const clock = clockTextUtc(reading.validUtcMs);

  const sentences = [
    `Wind from the ${word.value} (${wholeDeg}°) at ${reading.speedMs.toFixed(1)} m/s, valid ${clock} (${relativeText(reading.validUtcMs, nowUtcMs)}).`,
  ];
  const timing = windTiming(reading.validUtcMs, nowUtcMs, parameters);
  if (timing === 'old') sentences.push('This is an old reading, not the wind now.');
  if (timing === 'forecast') sentences.push(`This is a forecast for ${clock}, not the wind now.`);
  sentences.push(WIND_MODEL_SENTENCE, WIND_TERMS_SENTENCE);
  return ok(sentences);
}
