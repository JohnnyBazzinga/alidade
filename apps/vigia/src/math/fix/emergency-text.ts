// The text the user can read to the emergency number (Req 14, design D11, §7.12): a template over
// the same words as the Fix. It holds no observer position but the user's own, and that only when
// the user has switched it on (Req 14.3); no Sighting id, no Incident id and no code. In Simulation
// mode it begins with the SIMULATION line (Req 14.7). This file is an I/O boundary: degrees are
// its output.

import { ellipse95, type Position } from '@alidade/core';
import { formatAzimuthDeg } from '@alidade/ui';
import { err, ok, type VigiaResult } from '../../result';
import type { Assessment } from '../assessment/assess';
import { clockTextUtc } from '../civil-time';
import { toDeg } from '../degrees';
import { checkParameters, type VigiaParameters } from '../parameters';
import { SIMULATION_TEXT } from '../texts';
import { fixWords } from './fix-words';
import { compassWord8, lengthText95, positionText } from './format';

/**
 * The longest text the template can make, from the longest string of each line (a simulation
 * line, an own position of 4 decimals, 30 sightings set aside, lengths written as "over 1000 km",
 * ages of 10 000 days, the longest axis words, the poor geometry sentence, and since 2026-11-19
 * the position line of three sightings that disagree with the line of what three can check):
 * 899 characters, built by a test. `checkParameters` requires `maxEmergencyTextChars` of at
 * least 899, so the text cannot exceed it (Req 14.8, 19.1). The own position is "I last sighted
 * from …" since 2026-11-20, so that nobody reads it as a live position (3 characters more).
 */
export const WORST_EMERGENCY_TEXT_CHARS = 899;

export interface EmergencyInput {
  readonly assessment: Assessment;
  readonly nowUtcMs: number;
  readonly mode: 'device' | 'simulation';
  /** The phone's own Position fix: used only when `includeOwnPosition` is on. */
  readonly ownPosition: { readonly position: Position; readonly accuracyM: number } | null;
  readonly includeOwnPosition: boolean;
}

const SIMULATION_LINE = SIMULATION_TEXT;
const FIRST_LINE = 'Smoke seen by phone compass sightings; not confirmed.';
const POSITIONS_LINE =
  'These positions come from phone compass sightings, which are off by several degrees.';
const DIRECTIONS_LINE =
  'These directions come from phone compass sightings, which are off by several degrees.';
/** What the sightings could not check, by the count of used Sightings (Req 14.11). */
const COUNT_LINES: Readonly<Record<number, string>> = {
  2: 'Two sightings cannot check each other.',
  3: 'Three sightings can show that they disagree, but not which one is off.',
};

/** The own position and its accuracy, rounded up; an accuracy of 0 m is written as the least step, 10 m. */
function ownText(own: {
  readonly position: Position;
  readonly accuracyM: number;
}): VigiaResult<string> {
  if (!(Number.isFinite(own.accuracyM) && own.accuracyM >= 0))
    return err('invalid_number', { field: 'accuracyM' });
  const position = positionText(own.position, own.accuracyM);
  if (!position.ok) return position;
  const accuracy = lengthText95(Math.max(own.accuracyM, Number.MIN_VALUE));
  if (!accuracy.ok) return accuracy;
  return ok(`${position.value.text}, known to about ${accuracy.value}`);
}

/**
 * The Emergency text (design §7.12), lines joined by a line feed. With a Fix: the position with
 * its radius, the 95 % area, the basis, the geometry, the own position when switched on, the
 * limits and the time it was written. With one used Sighting and no Fix: the direction with its
 * 1-sigma, rounded up to a whole degree. Fails with `insufficient_observations` with no used
 * Sighting, with the failure of the solve with two or more used and no Fix, with the failure of
 * Core's `ellipse95` for a Fix it refuses, with `unsupported_position` or `invalid_number`
 * (`accuracyM`) for an own position it cannot write, and with `invalid_number` naming `nowUtcMs`
 * or a parameter.
 */
export function emergencyText(
  input: EmergencyInput,
  parameters: VigiaParameters,
): VigiaResult<string> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  const { assessment, nowUtcMs } = input;
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  if (assessment.used.length === 0) return err('insufficient_observations');

  const own =
    input.includeOwnPosition && input.ownPosition !== null ? ownText(input.ownPosition) : null;
  if (own !== null && !own.ok) return own;
  const lines: string[] =
    input.mode === 'simulation' ? [SIMULATION_LINE, FIRST_LINE] : [FIRST_LINE];
  const written = `Written at ${clockTextUtc(nowUtcMs)}. The app that wrote this does not call or notify anyone.`;

  if (assessment.fix === null) {
    const entry = assessment.used[0];
    if (entry === undefined || assessment.used.length !== 1)
      return err('insufficient_observations');
    const { azimuthRad, azimuthSigmaRad } = entry.sighting.bearing;
    const word = compassWord8(azimuthRad);
    const sigmaDeg = toDeg(azimuthSigmaRad);
    if (!word.ok) return word;
    if (!sigmaDeg.ok) return sigmaDeg;
    // The 1-sigma rounded up to a whole degree (an uncertainty is never rounded down); the 1e-9
    // keeps a sigma of exactly 3° from becoming 4° through the conversion's last bit.
    const sigmaWholeDeg = Math.max(1, Math.ceil(sigmaDeg.value - 1e-9));
    lines.push(
      `Direction only, not a place: the smoke was seen toward ${formatAzimuthDeg(azimuthRad, 0)} degrees (${word.value}), give or take ${sigmaWholeDeg} degrees (1-sigma), from where the sighting was taken.`,
    );
    if (own !== null) lines.push(`I last sighted from ${own.value}.`);
    lines.push(DIRECTIONS_LINE, written);
    return ok(lines.join('\n'));
  }
  if (!assessment.fix.ok) return assessment.fix;

  const fix = assessment.fix.value;
  const e95 = ellipse95(fix.ellipse);
  if (!e95.ok) return e95;
  const words = fixWords(fix, assessment, nowUtcMs, parameters);
  if (!words.ok) return words;
  const position = positionText(fix.position, e95.value.semiMinorM);
  if (!position.ok) return position;
  const radius = lengthText95(e95.value.semiMajorM + position.value.printBoundM);
  if (!radius.ok) return radius;
  // Sightings that disagree say so in the line of the position, before any metres, and never
  // "probably within" (Req 14.11).
  lines.push(
    assessment.disagreement === 'none'
      ? `Position: ${position.value.text}, probably within about ${radius.value} (95 %).`
      : `Position: the sightings do not agree, at least one is off, and the area given may not contain the smoke; best fit ${position.value.text}, within about ${radius.value} (95 %).`,
    words.value.area,
    words.value.basis,
    words.value.geometry,
  );
  const countLine = COUNT_LINES[assessment.used.length];
  if (countLine !== undefined) lines.push(countLine);
  if (own !== null) lines.push(`I last sighted from ${own.value}.`);
  lines.push(POSITIONS_LINE, written);
  return ok(lines.join('\n'));
}
