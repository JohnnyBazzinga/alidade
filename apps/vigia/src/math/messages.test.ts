import { messageFor as uiMessageFor, UI_REASONS, type Message } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import {
  VIGIA_ONLY_REASON_LIST,
  VIGIA_REASONS,
  type VigiaOnlyReason,
  type VigiaReason,
} from '../reasons';
import { partsOf, problemsOf } from '../test-support/message-rules';
import { MESSAGES, messageFor } from './messages';

/**
 * The 22 rows of the table of design D2, typed out on purpose (the table is the specification:
 * "every row as written there"). A drift in the source fails here.
 */
const ROWS: Record<VigiaOnlyReason, Message> = {
  // Added by design §7.4a (2026-11-21), proposed there: a join that cannot be made.
  incident_not_joinable: {
    whatHappened: 'These two smokes cannot be joined into one.',
    whatToDo: 'Open the new sighting as a separate smoke, or delete a smoke you no longer need.',
  },
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

describe('MESSAGES (Req 2.3, design D2)', () => {
  it('has exactly the keys of VIGIA_REASONS: 70 rows, none missing and none extra', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...VIGIA_REASONS].sort());
    expect(Object.keys(MESSAGES)).toHaveLength(70);
  });

  it('has, for each of the 47 UI reasons, the row UI\u2019s own messageFor gives', () => {
    expect(UI_REASONS).toHaveLength(47);
    for (const reason of UI_REASONS) {
      expect(MESSAGES[reason], reason).toEqual(uiMessageFor({ ok: false, reason }));
    }
  });

  it('has the 23 rows of design D2 and §7.4a as written there', () => {
    expect(Object.keys(ROWS)).toHaveLength(23);
    for (const reason of VIGIA_ONLY_REASON_LIST) {
      expect(MESSAGES[reason], reason).toEqual(ROWS[reason]);
    }
  });

  it('holds each of the 23 to the rules of UI: one sentence, 160 characters, no code (Req 2.3)', () => {
    for (const reason of VIGIA_ONLY_REASON_LIST) {
      for (const part of partsOf(MESSAGES[reason])) {
        expect(problemsOf(part, reason), `${reason}: ${part}`).toEqual([]);
      }
    }
  });

  it('holds all 70 rows to the same rules, so that a UI row cannot break them here either', () => {
    for (const reason of VIGIA_REASONS) {
      for (const part of partsOf(MESSAGES[reason])) {
        expect(problemsOf(part, reason), `${reason}: ${part}`).toEqual([]);
      }
    }
  });

  // Req 2.4 ("names the thing the user can act on") is a judgement of wording that a pattern
  // cannot make; what a test can hold is that no whatToDo is only "try again" or a few words.
  // The wording is design D2's, reviewed; the `outlier` row says "it" for the sighting.
  it('has a whatToDo of at least five words that is not only "try again" (Req 2.4)', () => {
    for (const reason of VIGIA_ONLY_REASON_LIST) {
      const { whatToDo } = MESSAGES[reason];
      expect(whatToDo.split(/\s+/).length, reason).toBeGreaterThanOrEqual(5);
      expect(whatToDo, reason).not.toMatch(/^try again\.?$/i);
    }
  });

  it('does not hold the rows of the three hotspot reasons (second release)', () => {
    for (const reason of [
      'overlay_needs_key',
      'overlay_area_too_large',
      'hotspot_footprint_unknown',
    ]) {
      expect(Object.keys(MESSAGES)).not.toContain(reason);
    }
  });

  it('does not compile for a new reason without a row (type level, held by `pnpm typecheck`)', () => {
    type WithNewReason = VigiaReason | 'a_new_reason';
    // @ts-expect-error the table has no row for 'a_new_reason'
    const bigger: Record<WithNewReason, Message> = MESSAGES;
    expect(bigger).toBe(MESSAGES);
  });
});

describe('messageFor (Req 2.3, 2.5)', () => {
  it('returns the row of each Vigia reason', () => {
    for (const reason of VIGIA_ONLY_REASON_LIST) {
      expect(messageFor({ ok: false, reason })).toEqual(ROWS[reason]);
    }
  });

  it('is UI\u2019s own messageFor for a UI reason, the number of a coarse location included', () => {
    const failure = { ok: false, reason: 'coarse_location', reportedAccuracyM: 1234 } as const;
    expect(messageFor(failure)).toEqual(uiMessageFor(failure));
    expect(messageFor(failure).whatHappened).toContain('1.2 km');
    for (const reason of UI_REASONS) {
      expect(messageFor({ ok: false, reason }), reason).toEqual(
        uiMessageFor({ ok: false, reason }),
      );
    }
  });

  it('is a pure function of the failure: the field and the id change nothing', () => {
    const plain = messageFor({ ok: false, reason: 'sighting_conflict' });
    const detailed = messageFor({
      ok: false,
      reason: 'sighting_conflict',
      field: 'x',
      id: 'H4TN9RV6C',
    });
    expect(detailed).toEqual(plain);
    expect(partsOf(detailed).join(' ')).not.toContain('H4TN9RV6C');
  });

  it('gives each of the 23 a Message that no other reason has', () => {
    const owners = new Map<string, VigiaReason[]>();
    for (const reason of VIGIA_REASONS) {
      const key = JSON.stringify(messageFor({ ok: false, reason }));
      owners.set(key, [...(owners.get(key) ?? []), reason]);
    }
    for (const reason of VIGIA_ONLY_REASON_LIST) {
      const key = JSON.stringify(messageFor({ ok: false, reason }));
      expect(owners.get(key), reason).toEqual([reason]);
    }
  });
});
