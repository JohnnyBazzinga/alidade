import { describe, expect, it } from 'vitest';
import {
  AIM_LINE_TEXT,
  COMPASS_ONE_LINE_TEXT,
  countLineText,
  EMERGENCY_NOT_CALLING_TEXT,
  INBOX_WARNING_LINE_TEXT,
  JOIN_CONFIRM_TEXT,
  LEAVES_STATEMENT_TEXT,
  QR_ONE_LINE_TEXT,
  FIX_LIMITS_TEXT,
  NOT_CALLING_TEXT,
  sightingGuidance,
  TWO_SMOKES_TEXT,
  BEARING_LABEL,
  HOW_TO_STEPS,
  HOW_TO_TITLE,
  QR_VIEW_TITLE,
  QUESTION_TITLE,
  SCHEMATIC_TEXT,
  TAGLINE_TEXT,
  TIP_TITLE,
  UNCERTAINTY_LABEL,
} from './texts';

describe('the fixed sentences (Req 6.3, 14.5, 16.1, 16.2, 4.3)', () => {
  it('states what the 95 % ellipse does and does not say, and that compasses are off (Req 6.3, 16.1)', () => {
    expect(FIX_LIMITS_TEXT).toBe(
      'This is a 95 % region if every sighting was aimed at the same point and its errors are independent and as stated. Phone compasses are off by several degrees; setting north on the Sun or a landmark reduces that.',
    );
  });

  it('says that the app calls no one, on the first screen and beside the Emergency text (Req 14.5)', () => {
    expect(NOT_CALLING_TEXT).toBe(
      'This app does not call or notify anyone. If there is fire, call the emergency number first.',
    );
    expect(EMERGENCY_NOT_CALLING_TEXT).toBe(
      'This app does not call or notify anyone. Call the emergency number; this text only helps you say where the smoke is.',
    );
    for (const text of [NOT_CALLING_TEXT, EMERGENCY_NOT_CALLING_TEXT]) {
      expect(text).not.toMatch(/\d{3}|tel:|dial/i);
    }
  });

  it('says how to aim at smoke, and adds the wind only when a wind reading is shown (Req 16.2, 13.5)', () => {
    const without = sightingGuidance(false);
    expect(without).toEqual([
      'Aim at the base of the smoke, where it meets the ground or the ridge, not at the top, which the wind has moved.',
      'Stand where the smoke is clearly in view.',
      'Hold the phone still until the readout says steady.',
    ]);
    const withWind = sightingGuidance(true);
    expect(withWind.slice(0, 3)).toEqual(without);
    expect(withWind[3]).toBe(
      'The smoke leans downwind, so aim lower down the column, at its base.',
    );
    expect(withWind).toHaveLength(4);
  });

  it('says that a second smoke column needs its own smoke (Req 4.3)', () => {
    expect(TWO_SMOKES_TEXT).toBe(
      'A second column of smoke seen from the same place needs a smoke of its own.',
    );
  });

  it('holds none of the words that would claim certainty (Req 6.3)', () => {
    for (const text of [
      FIX_LIMITS_TEXT,
      NOT_CALLING_TEXT,
      EMERGENCY_NOT_CALLING_TEXT,
      TWO_SMOKES_TEXT,
      ...sightingGuidance(true),
    ]) {
      expect(text).not.toMatch(/exact|located at|confirmed|precisely/i);
    }
  });
});

// Task 23 (2026-11-21): the sentences of the first-use flow on a phone.
describe('the sentences of the flow on a phone (Req 3.7, 4.8, 4.12, 6.12, 10.7, 10.11, 15.2, 15.7)', () => {
  it('has the aiming line, the one sentence on compasses and the warning line, word for word', () => {
    expect(AIM_LINE_TEXT).toBe('Aim at the base of the smoke');
    expect(COMPASS_ONE_LINE_TEXT).toBe('Phone compasses are off by several degrees.');
    expect(INBOX_WARNING_LINE_TEXT).toBe('Anyone can make a code; a wrong one moves the position.');
  });

  it('writes the line after a join, an add and a new smoke, in the singular for one', () => {
    expect(countLineText('joined', 3)).toBe('Joined: 3 sightings');
    expect(countLineText('joined', 1)).toBe('Joined: 1 sighting');
    expect(countLineText('added', 1)).toBe('Added: 1 sighting');
    expect(countLineText('opened', 2)).toBe('New smoke opened: 2 sightings');
  });

  it('is total: a number that is not a count gives a count of 0, never NaN', () => {
    for (const n of [Number.NaN, Number.POSITIVE_INFINITY, -3, 1.5]) {
      expect(countLineText('joined', n)).not.toMatch(/NaN|Infinity|undefined|null|-/);
    }
  });

  // The shrunk counterexample of P-2.6 (seed -226173570): 1e21 is an integer and printed as
  // "1e+21 sightings".
  it('writes a count too large for a count as 0, never in exponent form', () => {
    expect(countLineText('joined', 1e21)).toBe('Joined: 0 sightings');
    expect(countLineText('added', Number.MAX_SAFE_INTEGER)).toBe('Added: 0 sightings');
    expect(countLineText('opened', 32)).toBe('New smoke opened: 32 sightings');
  });

  it('says in the statement all that a code shows and that it cannot be taken back (Req 15.2)', () => {
    for (const part of [
      'about 1 m',
      'how well the phone knew',
      'when',
      'direction',
      'uncertainty',
      'which smoke',
      'cannot be taken back',
    ]) {
      expect(LEAVES_STATEMENT_TEXT).toContain(part);
    }
  });

  it('says the three things of Req 4.8 in at most two sentences', () => {
    expect(JOIN_CONFIRM_TEXT.split(/(?<=\.)\s+/)).toHaveLength(2);
    expect(JOIN_CONFIRM_TEXT).toMatch(/one position/);
    expect(JOIN_CONFIRM_TEXT).toMatch(/different/);
    expect(JOIN_CONFIRM_TEXT).toMatch(/cannot be undone|not taken back/);
  });

  it('says beside the QR that the other phone needs a connection, and names no emergency number', () => {
    expect(QR_ONE_LINE_TEXT).toMatch(/connection/);
    for (const t of [
      AIM_LINE_TEXT,
      COMPASS_ONE_LINE_TEXT,
      QR_ONE_LINE_TEXT,
      LEAVES_STATEMENT_TEXT,
    ]) {
      expect(t).not.toMatch(/\d{3}|tel:|dial|NaN|undefined|null/i);
    }
  });
});

// Req 22.15 (2026-11-22, the lead's new look): the only new strings of the Field look, word for word.
describe('the strings of the Field look (Req 22.15)', () => {
  it('has each one word for word', () => {
    expect(TAGLINE_TEXT).toBe('Help locate smoke with sightings from different places.');
    expect(QUESTION_TITLE).toBe('New sighting');
    expect(QR_VIEW_TITLE).toBe('QR code');
    expect(HOW_TO_TITLE).toBe('How to sight');
    expect(HOW_TO_STEPS).toEqual([
      'Hold the phone upright.',
      'Tap Start.',
      'Put the crosshair on the base of the smoke.',
    ]);
    expect(TIP_TITLE).toBe('Accuracy tip');
    expect(BEARING_LABEL).toBe('Bearing');
    expect(UNCERTAINTY_LABEL).toBe('Uncertainty (1-sigma)');
    expect(SCHEMATIC_TEXT).toEqual({
      stood: 'Where you stood',
      next: 'Where to go next',
      baseline: 'At least 1/3 of the distance',
      sight: 'Line of sight',
      smoke: 'Smoke',
      label: 'Schematic, not to scale: the distance is your estimate, not a measured position.',
    });
  });

  it('claims no certainty either (Req 6.3)', () => {
    for (const text of [
      TAGLINE_TEXT,
      ...HOW_TO_STEPS,
      TIP_TITLE,
      ...Object.values(SCHEMATIC_TEXT),
    ]) {
      expect(text).not.toMatch(/exact|located at|confirmed|precisely/i);
    }
  });
});
