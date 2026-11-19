// The fixed sentences of the app (Req 4.3, 6.3, 14.5, 16.1, 16.2, design §7.8, §9). The
// statements by count are in `assessment/statements.ts`; the sentences built from numbers are in
// `fix/`. None names an emergency number, holds a link that dials, or claims certainty.

/** What the 95 % ellipse does and does not say (Req 6.3, 16.1). */
export const FIX_LIMITS_TEXT =
  'This is a 95 % region if every sighting was aimed at the same point and its errors are independent and as stated. Phone compasses are off by several degrees; setting north on the Sun or a landmark reduces that.';

/** At the top of the first screen (Req 14.5). */
export const NOT_CALLING_TEXT =
  'This app does not call or notify anyone. If there is fire, call the emergency number first.';

/** Beside the Emergency text (Req 14.5). */
export const EMERGENCY_NOT_CALLING_TEXT =
  'This app does not call or notify anyone. Call the emergency number; this text only helps you say where the smoke is.';

/** With the question "same smoke as before?" (Req 4.3). */
export const TWO_SMOKES_TEXT =
  'A second column of smoke seen from the same place needs a smoke of its own.';

/** How to sight smoke (Req 16.2); the last sentence only when a wind reading is shown (Req 13.5). */
export function sightingGuidance(windShown: boolean): readonly string[] {
  const always = [
    'Aim at the base of the smoke, where it meets the ground or the ridge, not at the top, which the wind has moved.',
    'Stand where the smoke is clearly in view.',
    'Hold the phone still until the readout says steady.',
  ];
  return windShown
    ? [...always, 'The smoke leans downwind, so aim lower down the column, at its base.']
    : always;
}
