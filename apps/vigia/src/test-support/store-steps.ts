// `storeSteps` (design §11, P-15.9): `storageActions` extended to the acts of Requirements 3 to
// 14, as the screens perform them on the store and the Adapters (test support, not exported).
//
// Domain: 0 to 200 steps among `capture` (a Bearing of a pool of 12, the answer "same" or "new"),
// `paste`, `link` (the page's fragment changes to a link) and `deliver` (the Transport delivers),
// each with a code of a pool of 12 Sightings over the five Incidents of `INCIDENT_POOL`, damaged one
// draw in six; `add`, `ignore` and `joinSame` ("it is the same smoke as the one I have open",
// Req 4.8) of an Inbox card; `hide`, `show`, `delete`; `share` by `link`,
// `system_share`, `text`, `qr` or `transport` (the Share sheet's acts: a copy, the share sheet,
// the QR drawn, the Transport's send); `copyEmergency` (the Emergency text, with the own-position
// switch drawn); `deleteAll`; `expire` (the clock moves 0 to 3 hours); `reload` (a new store over the
// same storage); `wind` (the Overlays' switch: on, off or Refresh, the only acts that may ask for
// data; in the cut project there is no Overlay and the step does nothing). Excludes everything else.

import fc from 'fast-check';
import { uniformInteger } from './generators';
import { canonicalOf, INCIDENT_ID } from './incident-fixtures';
import { INCIDENT_POOL } from './storage-actions';

export const SHARE_KINDS = ['link', 'system_share', 'text', 'qr', 'transport'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export type StoreStep =
  | { readonly kind: 'capture'; readonly bearing: number; readonly answer: 'same' | 'new' }
  | {
      readonly kind: 'paste' | 'link' | 'deliver';
      readonly code: number;
      readonly damaged: boolean;
    }
  | { readonly kind: 'add' | 'ignore'; readonly pick: number; readonly join: boolean }
  | { readonly kind: 'joinSame'; readonly pick: number }
  | { readonly kind: 'hide' | 'show' | 'delete'; readonly pick: number }
  | { readonly kind: 'share'; readonly pick: number; readonly how: ShareKind }
  | { readonly kind: 'copyEmergency'; readonly includeOwnPosition: boolean }
  | { readonly kind: 'wind'; readonly how: 'on' | 'off' | 'refresh' }
  | { readonly kind: 'deleteAll' }
  | { readonly kind: 'expire'; readonly jumpMs: number }
  | { readonly kind: 'reload' };

export const BEARING_POOL_SIZE = 12;
export const CODE_POOL_SIZE = 12;

/** The received code number `n` of the pool: Sightings 101 to 112, over the five Incidents. */
export function poolCode(n: number): string {
  const incidentId = INCIDENT_POOL[n % INCIDENT_POOL.length] ?? INCIDENT_ID;
  return canonicalOf(101 + n, incidentId, {}, 'received').code;
}

/** The code with one symbol changed: always `code_damaged`. */
export function damage(code: string): string {
  const i = 17;
  return `${code.slice(0, i)}${code[i] === '2' ? '3' : '2'}${code.slice(i + 1)}`;
}

export function storeSteps(): fc.Arbitrary<StoreStep[]> {
  const pick = uniformInteger(0, 1000);
  const code = uniformInteger(0, CODE_POOL_SIZE - 1);
  const damaged = fc.integer({ min: 0, max: 5 }).map((d) => d === 0);
  const step: fc.Arbitrary<StoreStep> = fc.oneof(
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constant('capture' as const),
        bearing: uniformInteger(0, BEARING_POOL_SIZE - 1),
        answer: fc.constantFrom('same' as const, 'new' as const),
      }),
    },
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constantFrom('paste' as const, 'link' as const, 'deliver' as const),
        code,
        damaged,
      }),
    },
    {
      weight: 3,
      arbitrary: fc.record({
        kind: fc.constantFrom('add' as const, 'ignore' as const),
        pick,
        join: fc.boolean(),
      }),
    },
    {
      weight: 3,
      arbitrary: fc.record({ kind: fc.constant('joinSame' as const), pick }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        kind: fc.constantFrom('hide' as const, 'show' as const, 'delete' as const),
        pick,
      }),
    },
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constant('share' as const),
        pick,
        how: fc.constantFrom(...SHARE_KINDS),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('copyEmergency' as const),
        includeOwnPosition: fc.boolean(),
      }),
    },
    {
      weight: 3,
      arbitrary: fc.record({
        kind: fc.constant('wind' as const),
        how: fc.constantFrom('on' as const, 'off' as const, 'refresh' as const),
      }),
    },
    { weight: 1, arbitrary: fc.constant({ kind: 'deleteAll' as const }) },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('expire' as const),
        jumpMs: uniformInteger(0, 3 * 3_600_000),
      }),
    },
    { weight: 1, arbitrary: fc.constant({ kind: 'reload' as const }) },
  );
  // `size: 'max'`: the lengths reach 200 (fast-check's default size draws about ten).
  return fc.array(step, { maxLength: 200, size: 'max' });
}
