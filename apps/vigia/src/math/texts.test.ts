import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_NOT_CALLING_TEXT,
  FIX_LIMITS_TEXT,
  NOT_CALLING_TEXT,
  sightingGuidance,
  TWO_SMOKES_TEXT,
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
