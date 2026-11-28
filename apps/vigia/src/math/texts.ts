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

// ---- The first use on a phone (task 23, 2026-11-21; design D23) -------------------------------

/** The one visible line of the Sight screen (Req 3.7); the guidance is under "How to aim". */
export const AIM_LINE_TEXT = 'Aim at the base of the smoke';

/** The first screen with no smoke (Mira, 2026-11-27): its title and the line under it. */
export const HOME_TITLE = 'Nothing on the horizon';
export const HOME_LEAD = 'See smoke? Aim at its base and tap the sight.';

/**
 * The line of small capitals over the smoke's state (Mira): how many places of the two that a
 * position needs, and whether the smoke is located. Written in sentence case; the screen draws it
 * in capitals.
 */
export function smokeStateCaption(usedCount: number, located: boolean): string {
  // A count of sightings is small: a larger number is not one (and would print in exponent form).
  const n =
    Number.isInteger(usedCount) && usedCount >= 0 && usedCount <= MAX_COUNT_LINE ? usedCount : 0;
  if (located) return `${n} sightings · smoke located`;
  if (n < 2) return `${n} of 2 places · smoke not located`;
  return `${n} sightings · smoke not located`;
}

/** What one simulated phone holds, for the reviewer's step line (Req 17.7). */
export interface PostState {
  readonly id: string;
  /** The Station's name, "West post". */
  readonly name: string;
  /** The sightings taken on that phone (not received), of every smoke. */
  readonly sightings: number;
  /** The sightings waiting in its Inbox. */
  readonly waiting: number;
  /** Its open smoke has a position. */
  readonly located: boolean;
}

const countOf = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The reviewer's step line under "You hold the phone at" (Req 17.7; 2026-11-28, both reviewers: a
 * judge did not know that a post is a phone, nor where a sent sighting went). Worked out from the
 * phones' state, so that it is right whatever the reviewer did: sight from one post, sight from
 * another, send one to the other phone, add it there, done. Total over any input.
 */
export function reviewerStep(posts: readonly PostState[], currentId: string): string {
  const here = posts.find((p) => p.id === currentId);
  const name = (p: PostState | undefined) => `the ${p?.name ?? 'other post'}`;
  const located = posts.find((p) => p.located);
  if (located !== undefined) {
    return located.id === currentId
      ? 'Done · the smoke is located: Show on map'
      : `Done · the smoke is located on the phone at ${name(located)}`;
  }
  const waiting = posts.find((p) => countOf(p.waiting) > 0);
  if (waiting !== undefined) {
    return waiting.id === currentId
      ? 'Step 4 of 4 · Add the sighting waiting here: the same smoke'
      : `Step 4 of 4 · Go to ${name(waiting)}: a sighting is waiting there`;
  }
  const sighted = posts.filter((p) => countOf(p.sightings) > 0);
  if (sighted.length === 0) return `Step 1 of 4 · Sight the smoke from ${name(here)}`;
  if (sighted.length === 1) {
    const other = posts.find((p) => countOf(p.sightings) === 0 && p.id !== sighted[0]?.id);
    return sighted[0]?.id === currentId
      ? `Step 2 of 4 · Sight it from ${name(other)}`
      : `Step 2 of 4 · Sight the smoke from here, ${name(here)}`;
  }
  const other = sighted.find((p) => p.id !== currentId);
  return countOf(here?.sightings ?? 0) > 0
    ? `Step 3 of 4 · Send this sighting to the phone at ${name(other)}`
    : `Step 3 of 4 · Go to ${name(sighted[0])} and send its sighting`;
}

/** In the first view of a Fix, where the limits note is in full under "Details and limits" (Req 6.12, 16.1). */
export const COMPASS_ONE_LINE_TEXT = 'Phone compasses are off by several degrees.';

/** The one visible line of an Inbox card; the whole text is `NO_PROOF_TEXT` under "Why check this?" (Req 15.7). */
export const INBOX_WARNING_LINE_TEXT = 'Anyone can make a code; a wrong one moves the position.';

/** Under "Why check this?", after `NO_PROOF_TEXT` (Req 4.8). */
export const JOIN_HIDE_TEXT =
  'Joining crosses the sightings for good, but a joined smoke’s sightings can still be hidden or deleted one by one.';

/** The confirmation of a join: the three things of Req 4.8 in two short sentences. */
export const JOIN_CONFIRM_TEXT =
  'Joining puts all the sightings into one position. Two different smokes must not be joined, and a join cannot be undone.';

/** The confirmation of opening a code as a new smoke here (Req 4.2). */
export const OPEN_NEW_CONFIRM_TEXT =
  'Open this as a new smoke on this phone? Its sightings will be listed with where they came from.';

/** What leaves with a code, always visible on the Share sheet (Req 15.2); the long text is `CODE_HOLDS_TEXT`. */
export const LEAVES_STATEMENT_TEXT =
  'Whoever receives this code sees where you stood (to about 1 m, and how well the phone knew it), when, the direction with its uncertainty, and which smoke. It cannot be taken back.';

/** Beside the QR (Req 10.7): the page has to be loaded by the other phone. */
export const QR_ONE_LINE_TEXT =
  'It works only when the phones are together, and the other phone needs a connection to open the page.';

/** The two choices and the disclosure of the Share sheet (Req 10.8, 10.11). */
export const SHARE_QR_LABEL = 'Show QR code (someone beside you)';
export const SHARE_SEND_LABEL = 'Send link (someone far away)';
export const SHARE_OTHER_LABEL = 'Other ways (no connection)';
/** The next step after one sighting (Req 22.18, 2026-11-28): two cards, each a title and a line. */
/**
 * The question after a second capture (2026-11-28, both reviewers): the capture is not saved until
 * it is answered, and leaving the question throws it away, so the caption and the control say so.
 */
export const QUESTION_CAPTION = 'Not saved yet';
export const DISCARD_CAPTURE_LABEL = 'Discard this sighting';

/** In the Simulator the second place is the other post, which is another phone (2026-11-28). */
export const SIM_MOVE_LINE = 'Switches to the phone there';
/** The same card when the phone in hand has not sighted the smoke itself yet. */
export const SIM_HERE_LINE = 'This phone has not sighted it yet';

/** The card at the top of the Smoke screen while a sighting waits in the Inbox (2026-11-28). */
export const WAITING_LINE = 'From another phone. Tap to add it.';

export const NEXT_MOVE_TITLE = 'Move and sight again';
export const NEXT_MOVE_LINE = 'Walk or drive sideways first';
export const NEXT_SEND_TITLE = 'Send this sighting';
export const NEXT_SEND_LINE = 'For someone at another place';
/** The line on the Smoke screen after the Share sheet closes, while the smoke has one sighting. */
export const SENT_BACK_TEXT = 'Sent it? Ask them to send theirs back to see the position here too.';

/** The two choices as Mira's cards draw them: a title and, under it, for whom (2026-11-27). */
export const SHARE_QR_TITLE = 'Show QR code';
export const SHARE_QR_FOR = 'For someone beside you';
export const SHARE_SEND_TITLE = 'Send link';
export const SHARE_SEND_FOR = 'For someone far away';

// The Field look (Req 22.15, 2026-11-22): the only strings that the look adds.

/** The full header's tagline (Req 22.2). */
export const TAGLINE_TEXT = 'Help locate smoke with sightings from different places.';
/** The compact header's title of the question after a capture (Req 22.9). */
export const QUESTION_TITLE = 'New sighting';
/** The compact header's title of the QR view (Req 22.10). */
export const QR_VIEW_TITLE = 'QR code';
/** The how-to card before Start (Req 22.8). */
export const HOW_TO_TITLE = 'How to sight';
export const HOW_TO_STEPS = [
  'Hold the phone upright.',
  'Tap Start.',
  'Put the crosshair on the base of the smoke.',
] as const;
/** The tip card's title; its text is the limits line (Req 22.8). */
export const TIP_TITLE = 'Accuracy tip';
/** The labels of the question's Bearing card (Req 22.9). */
export const BEARING_LABEL = 'Bearing';
export const UNCERTAINTY_LABEL = 'Uncertainty (1-sigma)';
/** The schematic's labels and its name (Req 22.12). */
export const SCHEMATIC_TEXT = {
  stood: 'Where you stood',
  next: 'Where to go next',
  baseline: 'At least 1/3 of the distance',
  sight: 'Line of sight',
  smoke: 'Smoke',
  label: 'Schematic, not to scale: the distance is your estimate, not a measured position.',
} as const;

/** The largest count `countLineText` writes: far above `MAX_SIGHTINGS_PER_INCIDENT`. */
const MAX_COUNT_LINE = 1_000_000;

/**
 * The line after a join, an add or a new smoke (Req 4.12): `Joined: 3 sightings`. `n` is a count;
 * anything else reads as 0, so that no `NaN` is ever written.
 */
export function countLineText(kind: 'joined' | 'added' | 'opened', n: number): string {
  // A count of sightings is small: a larger number is not one (and would print in exponent form).
  const count = Number.isInteger(n) && n >= 0 && n <= MAX_COUNT_LINE ? n : 0;
  const what = `${count} ${count === 1 ? 'sighting' : 'sightings'}`;
  if (kind === 'joined') return `Joined: ${what}`;
  if (kind === 'added') return `Added: ${what}`;
  return `New smoke opened: ${what}`;
}
