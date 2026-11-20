// Plain-language Messages, one table keyed by reason (Req 2.3, 2.4, design D2, §8.1).
//
// Every part is non-empty and contains none of: the reason's code, an underscore, `NaN`,
// `Infinity`, `undefined`, `null` or `[object` (Req 2.3); the whatToDo part names what the user
// can act on (Req 2.4). `messages.test.ts` holds the table to that and to the rows of design
// §8.1. English only.
//
// The table is `Record<NoniusReason, Message>`: a new reason without a row fails type checking.
// UI's rows are UI's own, built once from UI's `messageFor`, except the six reasons that `solve`
// returns for Sights, which are given Nonius's words about sights and the Sun (`SIGHT_ROWS`). A
// failure with another UI reason is answered by UI's `messageFor` itself, so that the numbers a
// few of its Messages carry (the accuracy of a coarse location) are kept.

import { messageFor as uiMessageFor, UI_REASONS, type Message, type UiReason } from '@alidade/ui';
import type { NoniusOnlyReason, NoniusReason } from '../reasons';
import type { NoniusFailure } from '../result';

/** The rows of Nonius's 11 reasons, as written in design §8.1. */
const ONLY_ROWS: Record<NoniusOnlyReason, Message> = {
  sun_too_low: {
    whatHappened:
      'The Sun is less than 5° above the horizon, too low to measure: near the horizon the air bends its light by an amount nobody can predict.',
    whatToDo:
      "Wait until the Sun is at least three fingers' width above the horizon at arm's length. At night there is nothing to sight; stars are not in this version.",
  },
  sun_too_high: {
    whatHappened: 'The Sun is more than 80° up, too close to overhead to sight with the phone.',
    whatToDo: 'Wait until the Sun is lower.',
  },
  sight_time_unsupported: {
    whatHappened: "The phone's clock gives a date this app cannot use.",
    whatToDo: "Set the phone's date and time to automatic, then take the sight again.",
  },
  sights_full: {
    whatHappened: 'This set already holds as many sights as it can.',
    whatToDo: 'Delete a sight you do not need, or start again.',
  },
  circles_do_not_meet: {
    whatHappened:
      'The circles of these sights do not cross: the sights are too close in time for their error, or one of them is wrong.',
    whatToDo: 'Take another sight a couple of hours later, or delete a sight you doubt.',
  },
  fix_too_uncertain: {
    whatHappened: 'The position would be uncertain by more than 2 000 km, so it is not shown.',
    whatToDo: 'Measure the index error, and take more sights hours apart.',
  },
  outlier: {
    whatHappened: 'This sight does not agree with the others, so it was set aside.',
    whatToDo:
      'Check that it was of the Sun and taken from the same place, and take it again if you can.',
  },
  index_error_implausible: {
    whatHappened: "The difference from the Sun's true height is too large to be the phone's error.",
    whatToDo:
      "Check that you sighted the Sun and that the phone's clock is right, then take the sights again.",
  },
  storage_unavailable: {
    whatHappened: 'This phone will not keep your sights after you close the page.',
    whatToDo: 'Keep the page open until you have your position.',
  },
  storage_corrupt: {
    whatHappened: 'Some saved sights could not be read and were left out.',
    whatToDo: 'Check the list, and take the missing sights again.',
  },
  storage_version_unsupported: {
    whatHappened:
      'The saved sights were written by a newer version of the app, so they were left alone.',
    whatToDo: 'Open the newest version of the app to see them.',
  },
};

/** The six reasons `solve` returns for Sights, in Nonius's words (design §8.1). */
type SightReason =
  | 'insufficient_observations'
  | 'singular_geometry'
  | 'not_converged'
  | 'out_of_range'
  | 'unsupported_position'
  | 'invalid_observation';

const SIGHT_ROWS: Record<SightReason, Message> = {
  insufficient_observations: {
    whatHappened: 'One sight gives a circle, not a position.',
    whatToDo: 'Take another sight a couple of hours later.',
  },
  singular_geometry: {
    whatHappened:
      "The Sun's direction has changed too little between the sights to give a position.",
    whatToDo: 'Wait until the Sun has moved across the sky, then take another sight.',
  },
  not_converged: {
    whatHappened: 'The sights do not settle on one position.',
    whatToDo: 'Delete a sight you doubt, or take another one.',
  },
  out_of_range: {
    whatHappened:
      'The sights lead more than 1 000 km from where their circles cross, so at least one is wrong.',
    whatToDo: 'Delete a sight you doubt, or take the sights again.',
  },
  unsupported_position: {
    whatHappened: 'The position would be within 1° of a pole, where this app does not work.',
    whatToDo: 'Nonius cannot give a position this close to a pole.',
  },
  invalid_observation: {
    whatHappened: 'A sight could not be used.',
    whatToDo: 'Delete it and take it again.',
  },
};

const SIGHT_REASON_SET: ReadonlySet<string> = new Set(Object.keys(SIGHT_ROWS));
const UI_REASON_SET: ReadonlySet<string> = new Set(UI_REASONS);

/** True for a reason UI knows (a type guard over UI's own list, so no cast is needed). */
function isUiReason(reason: NoniusReason): reason is UiReason {
  return UI_REASON_SET.has(reason);
}

function isSightReason(reason: string): reason is SightReason {
  return SIGHT_REASON_SET.has(reason);
}

/** UI's rows, from UI's `messageFor` with each reason (one cast: `fromEntries` loses the keys). */
function uiRows(): Record<UiReason, Message> {
  return Object.fromEntries(
    UI_REASONS.map((reason) => [reason, uiMessageFor({ ok: false, reason })]),
  ) as Record<UiReason, Message>;
}

/** Every reason has a row (Req 2.3). */
export const MESSAGES: Record<NoniusReason, Message> = {
  ...uiRows(),
  ...SIGHT_ROWS,
  ...ONLY_ROWS,
};

/**
 * The Message for a failure: a pure function of it. The same failure gives an equal Message. A
 * reason without a row (impossible for a type-correct failure) gets the Message of
 * `invalid_number` rather than a throw (Req 2.1).
 */
export function messageFor(failure: NoniusFailure): Message {
  const { reason } = failure;
  if (isSightReason(reason)) return SIGHT_ROWS[reason];
  if (isUiReason(reason)) return uiMessageFor({ ...failure, reason });
  const row = Object.hasOwn(MESSAGES, reason) ? MESSAGES[reason] : undefined;
  return row ?? MESSAGES.invalid_number;
}
