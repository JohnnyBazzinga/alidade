import { messageFor as uiMessageFor, UI_REASONS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { NONIUS_REASONS, type NoniusReason } from '../reasons';
import { MESSAGES, messageFor } from './messages';

// The rows of design §8.1, as written there. The six reasons of `solve` that Sights give
// Nonius's own words are the last six.
const SECTION_8_1: Record<string, readonly [string, string]> = {
  sun_too_low: [
    'The Sun is less than 5° above the horizon, too low to measure: near the horizon the air bends its light by an amount nobody can predict.',
    "Wait until the Sun is at least three fingers' width above the horizon at arm's length. At night there is nothing to sight; stars are not in this version.",
  ],
  sun_too_high: [
    'The Sun is more than 80° up, too close to overhead to sight with the phone.',
    'Wait until the Sun is lower.',
  ],
  sight_time_unsupported: [
    "The phone's clock gives a date this app cannot use.",
    "Set the phone's date and time to automatic, then take the sight again.",
  ],
  sights_full: [
    'This set already holds as many sights as it can.',
    'Delete a sight you do not need, or start again.',
  ],
  circles_do_not_meet: [
    'The circles of these sights do not cross: the sights are too close in time for their error, or one of them is wrong.',
    'Take another sight a couple of hours later, or delete a sight you doubt.',
  ],
  fix_too_uncertain: [
    'The position would be uncertain by more than 2 000 km, so it is not shown.',
    'Measure the index error, and take more sights hours apart.',
  ],
  outlier: [
    'This sight does not agree with the others, so it was set aside.',
    'Check that it was of the Sun and taken from the same place, and take it again if you can.',
  ],
  index_error_implausible: [
    "The difference from the Sun's true height is too large to be the phone's error.",
    "Check that you sighted the Sun and that the phone's clock is right, then take the sights again.",
  ],
  storage_unavailable: [
    'This phone will not keep your sights after you close the page.',
    'Keep the page open until you have your position.',
  ],
  storage_corrupt: [
    'Some saved sights could not be read and were left out.',
    'Check the list, and take the missing sights again.',
  ],
  storage_version_unsupported: [
    'The saved sights were written by a newer version of the app, so they were left alone.',
    'Open the newest version of the app to see them.',
  ],
  insufficient_observations: [
    'One sight gives a circle, not a position.',
    'Take another sight a couple of hours later.',
  ],
  singular_geometry: [
    "The Sun's direction has changed too little between the sights to give a position.",
    'Wait until the Sun has moved across the sky, then take another sight.',
  ],
  not_converged: [
    'The sights do not settle on one position.',
    'Delete a sight you doubt, or take another one.',
  ],
  out_of_range: [
    'The sights lead more than 1 000 km from where their circles cross, so at least one is wrong.',
    'Delete a sight you doubt, or take the sights again.',
  ],
  unsupported_position: [
    'The position would be within 1° of a pole, where this app does not work.',
    'Nonius cannot give a position this close to a pole.',
  ],
  invalid_observation: ['A sight could not be used.', 'Delete it and take it again.'],
};

const SIGHT_REASONS = [
  'insufficient_observations',
  'singular_geometry',
  'not_converged',
  'out_of_range',
  'unsupported_position',
  'invalid_observation',
];

// Req 2.3: no part empty, none containing a code, an underscore, NaN, Infinity, undefined, null
// or [object. (UI's stricter one-sentence rule is not applied: design §8.1 writes two sentences
// in one row.)
const FORBIDDEN = /_|NaN|Infinity|undefined|null|\[object/;

describe('the Messages of Nonius (Req 2.3, 2.4, design §8.1)', () => {
  it('has a row for every reason, keyed by the closed set', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...NONIUS_REASONS].sort());
  });

  it('gives every reason two non-empty parts without a code or a forbidden string', () => {
    for (const reason of NONIUS_REASONS) {
      const m = messageFor({ ok: false, reason });
      for (const part of [m.whatHappened, m.whatToDo]) {
        expect(part.length, reason).toBeGreaterThan(0);
        expect(FORBIDDEN.test(part), `${reason}: ${part}`).toBe(false);
        expect(part.includes(reason), `${reason} names itself`).toBe(false);
        expect(part.trim(), reason).toBe(part);
      }
    }
  });

  it('says what the user can do, not only "try again" (Req 2.4)', () => {
    for (const reason of NONIUS_REASONS) {
      const todo = messageFor({ ok: false, reason }).whatToDo.toLowerCase();
      expect(todo.replace(/[^a-z ]/g, '').trim(), reason).not.toBe('try again');
    }
  });

  it('gives the rows of design §8.1 word for word', () => {
    for (const [reason, [happened, todo]] of Object.entries(SECTION_8_1)) {
      expect(messageFor({ ok: false, reason: reason as NoniusReason }), reason).toEqual({
        whatHappened: happened,
        whatToDo: todo,
      });
    }
  });

  it("gives Nonius's words, not UI's, for the six reasons that solve returns for Sights", () => {
    for (const reason of SIGHT_REASONS) {
      const mine = messageFor({ ok: false, reason: reason as NoniusReason });
      const ui = uiMessageFor({ ok: false, reason: reason as never });
      expect(mine, reason).not.toEqual(ui);
    }
  });

  it("leaves UI's own Messages for every other reason UI knows", () => {
    const sight = new Set(SIGHT_REASONS);
    for (const reason of UI_REASONS) {
      if (sight.has(reason)) continue;
      expect(messageFor({ ok: false, reason }), reason).toEqual(
        uiMessageFor({ ok: false, reason }),
      );
    }
  });

  it('is a pure function: equal failures give equal Messages, and a detail does not change it', () => {
    const a = messageFor({ ok: false, reason: 'sun_too_low', field: 'x' });
    const b = messageFor({ ok: false, reason: 'sun_too_low' });
    expect(a).toEqual(b);
  });

  it('falls back to the Message of invalid_number for a reason outside the set, without throwing', () => {
    const odd = messageFor({ ok: false, reason: 'no_such_reason' as never });
    expect(odd).toEqual(messageFor({ ok: false, reason: 'invalid_number' }));
    const proto = messageFor({ ok: false, reason: 'toString' as never });
    expect(proto).toEqual(messageFor({ ok: false, reason: 'invalid_number' }));
  });
});
