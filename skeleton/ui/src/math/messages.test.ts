import type { Reason } from '@alidade/core';
import { SENSOR_REASONS } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { UI_ONLY_REASON_LIST, UI_REASONS, type UiReason } from '../reasons';
import { err } from '../result';
import { MESSAGES, MUST_MENTION, messageFor } from './messages';
import { partsOf, problemsOf } from '../test-support/message-rules';

/** Core's twelve reasons, typed out (Core exports `Reason` as a type only). */
const CORE_REASONS = [
  'invalid_number',
  'undefined_mean',
  'coincident_positions',
  'unsupported_position',
  'invalid_observation',
  'unsupported_format',
  'not_converged',
  'singular_geometry',
  'insufficient_observations',
  'colocated_observers',
  'diverging_bearings',
  'out_of_range',
] as const satisfies readonly Reason[];

/** Req 3.7. */
const REQ_3_7: readonly UiReason[] = [
  'camera_permission_denied',
  'camera_unavailable',
  'camera_busy',
  'camera_track_ended',
  'camera_stopped',
  'camera_failed',
  'wrong_camera',
  'permission_denied',
  'permission_required',
  'insecure_context',
  'sensor_unavailable',
  'portrait_required',
  'compass_unreliable',
  'frame_reset',
  'stale_yaw_reference',
  'coarse_location',
  'declination_unknown',
];

describe('MESSAGES completeness (Req 3.2)', () => {
  it('has exactly the keys of UI_REASONS', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...UI_REASONS].sort());
  });

  it('covers the union of Sensors, Core and Req 2.2', () => {
    const union = new Set<string>([...SENSOR_REASONS, ...CORE_REASONS, ...UI_ONLY_REASON_LIST]);
    expect(new Set(UI_REASONS)).toEqual(union);
    expect(Object.keys(MESSAGES)).toHaveLength(31 + 16);
  });

  it('has no empty part and every part passes Req 3.3', () => {
    for (const reason of UI_REASONS) {
      const message = messageFor(err(reason, { reportedAccuracyM: 840 }));
      for (const part of partsOf(message)) {
        expect(problemsOf(part, reason), `${reason}: ${part}`).toEqual([]);
      }
    }
  });

  it('gives each reason its own Message', () => {
    const texts = UI_REASONS.map((r) => JSON.stringify(messageFor(err(r))));
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('Messages that name what the user can act on (Req 3.7, D18)', () => {
  it('has a MUST_MENTION entry for every reason of Req 3.7 and for no other', () => {
    expect(Object.keys(MUST_MENTION).sort()).toEqual([...REQ_3_7].sort());
  });

  it.each(REQ_3_7)('%s names its thing and is not only "try again"', (reason) => {
    const message = messageFor(err(reason, { reportedAccuracyM: 840 }));
    const text = `${message.whatHappened} ${message.whatToDo}`;
    for (const words of MUST_MENTION[reason] ?? []) expect(text).toMatch(words);
    expect(message.whatToDo.toLowerCase()).not.toMatch(/^try again\.?$/);
    expect(message.whatToDo.length).toBeGreaterThan('Try again.'.length);
  });

  it('fails the MUST_MENTION check for a Message that says only "try again"', () => {
    const lazy = 'Try again.';
    expect(lazy).not.toMatch(/camera/i);
    expect(lazy.toLowerCase()).toMatch(/^try again\.?$/);
  });
});

describe('coarse_location (Req 3.4)', () => {
  const text = (reportedAccuracyM?: number): string =>
    messageFor(
      reportedAccuracyM === undefined
        ? err('coarse_location')
        : err('coarse_location', { reportedAccuracyM }),
    ).whatHappened;

  it('rounds to the nearest 10 m below 1000 m', () => {
    expect(text(840)).toBe('The phone only knows its position to about 840 m.');
    expect(text(843)).toContain('840 m');
    expect(text(845)).toContain('850 m');
    expect(text(104)).toContain('100 m');
    expect(text(996)).toBe('The phone only knows its position to about 1.0 km.');
  });

  it('uses 0.1 km from 1000 m', () => {
    expect(text(1000)).toContain('1.0 km');
    expect(text(1049)).toContain('1.0 km');
    expect(text(1050)).toContain('1.1 km');
    expect(text(2340)).toContain('2.3 km');
    expect(text(25_000)).toContain('25.0 km');
  });

  it('gives no number when it is missing, NaN, infinite, not positive or not plausible', () => {
    for (const value of [undefined, Number.NaN, Infinity, -Infinity, 0, -5, Number.MAX_VALUE]) {
      const shown = text(value);
      expect(shown).toBe('The phone does not know its position precisely enough.');
      expect(shown).not.toMatch(/\d/);
    }
  });
});

describe('messageFor (Req 3.5)', () => {
  it('gives the same Message for the same failure', () => {
    for (const reason of UI_REASONS) {
      const failure = err(reason, { field: 'f', id: 'i', reportedAccuracyM: 1234 });
      expect(messageFor(failure)).toEqual(messageFor({ ...failure }));
    }
    expect(messageFor(err('camera_busy'))).toBe(messageFor(err('camera_busy', { field: 'x' })));
  });

  // Shrunk counterexample of P-3.11 under the first wording of Req 3.3 (a substring test of the
  // field): the field `arg` is inside the word "target" of this reason's Message. The Message
  // must not depend on the field at all (Req 3.3, amended), so it is compared with and without it.
  it('does not depend on a field that happens to be a substring of its words', () => {
    const plain = messageFor(err('outside_field_of_view', { reportedAccuracyM: 1.79e12 }));
    const withField = messageFor(
      err('outside_field_of_view', { field: 'arg', id: '', reportedAccuracyM: 1.79e12 }),
    );
    expect(plain.whatToDo).toContain('target');
    expect(withField).toEqual(plain);
  });

  it('does not show the field, the id or the error name', () => {
    const message = messageFor(
      err('camera_failed', { field: 'qzxwv', id: 'jkhgf', errorName: 'PlopError' }),
    );
    expect(message).toEqual(messageFor(err('camera_failed')));
    const text = JSON.stringify(message);
    for (const secret of ['qzxwv', 'jkhgf', 'PlopError', 'camera_failed'])
      expect(text).not.toContain(secret);
  });

  // Shrunk counterexample of P-3.11 under the first wording of Req 3.3 (a substring test of the
  // field): the field `arg` is inside the word "target" of this reason's Message. The Message
  // must not depend on the field at all (Req 3.3, amended), so it is compared with and without it.
  it('does not depend on a field that happens to be a substring of its words', () => {
    const plain = messageFor(err('outside_field_of_view', { reportedAccuracyM: 1.79e12 }));
    const withField = messageFor(
      err('outside_field_of_view', { field: 'arg', id: '', reportedAccuracyM: 1.79e12 }),
    );
    expect(plain.whatToDo).toContain('target');
    expect(withField).toEqual(plain);
  });

  it('does not throw for a reason that is not in the table', () => {
    const odd = { ok: false, reason: 'constructor' } as unknown as Parameters<typeof messageFor>[0];
    expect(messageFor(odd)).toEqual(messageFor(err('invalid_number')));
  });

  it('keeps the wording of design §7.17 for its examples', () => {
    expect(messageFor(err('camera_busy'))).toEqual({
      whatHappened: 'The camera is being used by another app.',
      whatToDo: 'Close the other app that uses the camera, then start again.',
    });
    expect(messageFor(err('portrait_required')).whatToDo).toBe(
      'Turn the phone to portrait and hold it upright, then try again.',
    );
  });
});
