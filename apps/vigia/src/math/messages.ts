// Plain-language Messages, one table keyed by reason (Req 2.3, 2.4, design D2).
//
// Every part is one sentence of at most 160 characters that ends with a full stop and contains
// none of: the reason's code, an underscore, `NaN`, `Infinity`, `undefined`, `null` or `[object`
// (Req 2.3), and the whatToDo part names what the user can act on (Req 2.4); `messages.test.ts`
// holds the table to that. English only. Wording avoids "e.g." and other full stops inside a
// sentence, so that one full stop means one sentence.
//
// The table is `Record<VigiaReason, Message>`: a new reason without a row fails type checking.
// The 47 rows of the reasons UI knows are UI's own, built once from UI's `messageFor`; a failure
// with a UI reason is answered by UI's `messageFor` itself, so that the numbers a few of its
// Messages carry (the accuracy of a coarse location) are kept.

import { messageFor as uiMessageFor, UI_REASONS, type Message, type UiReason } from '@alidade/ui';
import type { VigiaFailure } from '../result';
import type { VigiaOnlyReason, VigiaReason } from '../reasons';

/** The rows of Vigia's 23 reasons, as written in design D2 and §7.4a. */
const ONLY_ROWS: Record<VigiaOnlyReason, Message> = {
  code_damaged: {
    whatHappened: 'The code is damaged or cut off, so it was not used.',
    whatToDo: 'Ask the sender to send it again, and copy the whole link or the whole code.',
  },
  code_too_long: {
    whatHappened: 'That text is too long to be a sighting code.',
    whatToDo: 'Paste only the link or the code, not the whole message.',
  },
  code_version_unsupported: {
    whatHappened: 'This code was made by a different version of the app.',
    whatToDo: 'Ask the sender to open the newest version of the app and send it again.',
  },
  code_not_a_sighting: {
    whatHappened: 'That text does not look like a sighting code.',
    whatToDo: 'Paste the link or the code that the other person sent you.',
  },
  link_too_long: {
    whatHappened: 'The address of this page is too long to make a link or a QR code.',
    whatToDo: 'Share the code as text instead, or open the app from a shorter address.',
  },
  incident_unknown: {
    whatHappened: 'That smoke is not on this phone.',
    whatToDo: 'Open or start the smoke first, then add the sighting.',
  },
  incident_full: {
    whatHappened: 'This smoke already holds as many sightings as it can.',
    whatToDo: 'Delete a sighting you do not need, or start another smoke.',
  },
  incident_not_joinable: {
    whatHappened: 'These two smokes cannot be joined into one.',
    whatToDo: 'Open the new sighting as a separate smoke, or delete a smoke you no longer need.',
  },
  sighting_conflict: {
    whatHappened: 'Two different sightings carry the same identifier, so the first one was kept.',
    whatToDo: 'Compare the two, and ask the sender which one is right.',
  },
  simulation_not_shareable: {
    whatHappened: 'This is a simulated smoke, so it cannot be sent out of this page.',
    whatToDo: 'Use a real sighting if you want to share it with another phone.',
  },
  sighting_too_old: {
    whatHappened: 'This sighting is much older than the newest one, so it is not used.',
    whatToDo: 'Take a new sighting if the smoke is still there.',
  },
  sighting_time_implausible: {
    whatHappened: 'The time on this sighting does not fit this smoke, so it is not used.',
    whatToDo: 'Check that both phones show the right time and date, then send it again.',
  },
  outlier: {
    whatHappened: 'This sighting does not agree with the others, so it was set aside.',
    whatToDo: 'Check where it was taken from, and take it again if you can.',
  },
  hidden_by_user: {
    whatHappened: 'You hid this sighting, so it is not used.',
    whatToDo: 'Show it again if you want it to count.',
  },
  storage_unavailable: {
    whatHappened: 'This phone will not keep sightings after you close the page.',
    whatToDo: 'Keep the page open, and write the position down before you leave.',
  },
  storage_corrupt: {
    whatHappened: 'Some saved sightings could not be read and were left out.',
    whatToDo: 'Check the list, and take or ask for the missing sightings again.',
  },
  storage_version_unsupported: {
    whatHappened:
      'The saved sightings were written by a newer version of the app, so they were left alone.',
    whatToDo: 'Open the newest version of the app to see them.',
  },
  clipboard_unavailable: {
    whatHappened: 'The text could not be copied.',
    whatToDo: 'Select the text by hand and copy it, or read it out.',
  },
  host_not_allowed: {
    whatHappened: 'The app refused to contact a server that is not on its list.',
    whatToDo: 'Nothing was sent, so tell the people who run the app about it.',
  },
  overlay_unavailable: {
    whatHappened: 'The extra map information could not be loaded.',
    whatToDo: 'Check the connection and try again, or carry on without it.',
  },
  overlay_stale: {
    whatHappened: 'The wind reading is not for this moment.',
    whatToDo: 'Treat it as a forecast or an old reading, not as the wind now.',
  },
  transport_unavailable: {
    whatHappened: 'Sending is not available right now.',
    whatToDo: 'Use the text code, or try again when the connection is back.',
  },
  random_unavailable: {
    whatHappened:
      'This browser cannot make the random identifiers the app needs, so it cannot take sightings.',
    whatToDo: 'Open the app in a current version of Safari or Chrome.',
  },
};

const UI_REASON_SET: ReadonlySet<string> = new Set(UI_REASONS);

/** True for a reason UI knows (a type guard over UI's own list, so no cast is needed). */
function isUiReason(reason: VigiaReason): reason is UiReason {
  return UI_REASON_SET.has(reason);
}

/** UI's 47 rows, from UI's `messageFor` with each reason (one cast: `fromEntries` loses the keys). */
function uiRows(): Record<UiReason, Message> {
  return Object.fromEntries(
    UI_REASONS.map((reason) => [reason, uiMessageFor({ ok: false, reason })]),
  ) as Record<UiReason, Message>;
}

/** Every reason has a row (Req 2.3). */
export const MESSAGES: Record<VigiaReason, Message> = { ...uiRows(), ...ONLY_ROWS };

/**
 * The Message for a failure: a pure function of it. The same failure gives an equal Message. A
 * reason without a row (impossible for a type-correct failure) gets the Message of
 * `invalid_number` rather than a throw (Req 2.1).
 */
export function messageFor(failure: VigiaFailure): Message {
  const { reason } = failure;
  if (isUiReason(reason)) {
    return uiMessageFor({ ...failure, reason });
  }
  const row = Object.hasOwn(MESSAGES, reason) ? MESSAGES[reason] : undefined;
  return row ?? MESSAGES.invalid_number;
}
