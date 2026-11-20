// The fixed sentences of the app (Req 4.3, 6.3, 14.5, 16.1, 16.2, design §7.8, §9). The
// statements by count are in `assessment/statements.ts`; the sentences built from numbers are in
// `fix/`. None names an emergency number, holds a link that dials, or claims certainty.

/** The assumption under which the ellipse is a 95 % region (Req 6.3): shown beside UI's limits note. */
export const FIX_ASSUMPTION_TEXT =
  'This is a 95 % region if every sighting was aimed at the same point and its errors are independent and as stated.';

/** What the 95 % ellipse does and does not say (Req 6.3, 16.1). */
export const FIX_LIMITS_TEXT = `${FIX_ASSUMPTION_TEXT} Phone compasses are off by several degrees; setting north on the Sun or a landmark reduces that.`;

/** On the Sight screen in Simulation mode (Req 3.3). */
export const SIMULATION_VALUES_TEXT =
  "In the simulator the camera's field of view and the tap's uncertainty are simulation values, not a phone's.";

/**
 * The one wording of the simulation (Req 14.7, 17.4): the first line of every Emergency text made
 * in Simulation mode, and the banner at the top of every screen. Req 14.7 fixes this wording, and
 * the banner's earlier one would have made the longest Emergency text 925 characters, over 900.
 */
export const SIMULATION_TEXT = 'SIMULATION: synthetic scene, not a real place.';

/** At the top of the first screen (Req 14.5). */
export const NOT_CALLING_TEXT =
  'This app does not call or notify anyone. If there is fire, call the emergency number first.';

/** Beside the Emergency text (Req 14.5). */
export const EMERGENCY_NOT_CALLING_TEXT =
  'This app does not call or notify anyone. Call the emergency number; this text only helps you say where the smoke is.';

/** With the question "same smoke as before?" (Req 4.3). */
export const TWO_SMOKES_TEXT =
  'A second column of smoke seen from the same place needs a smoke of its own.';

/**
 * With the answer "it is the same smoke as the one I have open" (Req 4.8): what a join does, that
 * two different columns must not be joined, and that a join is not taken back.
 */
export const JOIN_CROSSES_TEXT =
  'Joining crosses all the sightings into one position, so two different columns of smoke must not be joined.';
export const JOIN_NOT_TAKEN_BACK_TEXT =
  'A join is not taken back: its sightings can still be hidden or deleted one by one.';

/**
 * The reviewer's path, on the first screen in Simulation mode while the phone in hand has sighted
 * nothing (task 21.5): three short lines, the post named. A smoke is located by sightings from two
 * posts, joined on one phone by sending one of them and answering that it is the same smoke.
 */
export const REVIEWER_PATH_TITLE = 'Try it in three steps';
export function reviewerPathLines(postName: string): readonly string[] {
  return [
    `Sight the smoke from here, the ${postName}.`,
    'Change to another post above, and sight the smoke again.',
    'Send one sighting to the other phone, and answer there that it is the same smoke.',
  ];
}

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

/** What a sighting code holds, before the first Share of a session and in every Share (Req 15.2). */
export const CODE_HOLDS_TEXT =
  'A sighting code holds where you stood, to about 1 m, how well the phone knew that position, the time, the direction and its uncertainty, and which smoke it is of. Whoever holds the code sees where you stood and when. Once it has left this phone, it cannot be taken back.';

/** Which presentation of a code is for whom (Req 10.7, 10.8). */
export const LINK_PURPOSE_TEXT = 'The link is for someone far away who has a connection.';
export const QR_PURPOSE_TEXT =
  'The QR code is for someone beside you: it works only when the phones are together, and the other phone needs a connection to open the page.';
export const TEXT_PURPOSE_TEXT =
  'The text code is for a phone that has the app open, even with no connection.';

/** Where a code is added (Req 15.7). */
export const NO_PROOF_TEXT =
  "A code carries no proof of who made it: anyone who knows this smoke's identifier can make one that looks real, and a wrong one moves the position. Every sighting is listed with where it came from and when, and you can hide one.";
