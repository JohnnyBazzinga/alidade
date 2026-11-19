// P-11.9, the decision half (Req 11.3, 11.9, design §11).
//
// Generator: `hostileRequest` (test-support/hostile-request.ts, domain stated there): a request
// built from parts, with the verdict known by construction. The oracle compares the parts with the
// Host list entry directly and never goes through `URL`. The property: `decideRequest` accepts if
// and only if the oracle does, and then names the entry the oracle names; the URLs of the wind
// builder are always accepted.

import { isSupportedPosition, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../parameters';
import { closed } from '../../test-support/generators';
import {
  acceptingEntry,
  CHANGE_NAMES,
  hostileRequest,
  isAcceptedByEntry,
  urlOf,
  type RequestParts,
} from '../../test-support/hostile-request';
import { isDeepRun } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { decideRequest } from './gate-decision';
import { buildHostList, WIND_ENTRY, type TileProvider } from './host-list';
import { windRequestUrl } from './request-boxes';

const PROVIDER: TileProvider = {
  host: 'tiles.example-maps.test',
  sourceName: 'Example Maps (synthetic)',
  termsUrl: 'https://example-maps.test/terms',
  attribution: 'Map data by Example Maps',
};
const built = buildHostList(
  [
    'https://tiles.example-maps.test/base/{z}/{x}/{y}.png',
    'https://tiles.example-maps.test/alt/{z}/{x}/{y}.jpg?style=plain',
  ],
  [PROVIDER],
);
if (!built.ok) throw new Error('the test Host list did not build');
const LIST = built.value;

// P-11.9 (decision): Req 11.3, 11.9.
describe('P-11.9: the decision accepts exactly the requests of the Host list (Req 11.3, 11.9)', () => {
  it('accepts if and only if the parts are the entry, and names that entry', () => {
    const tracker = new ErrorTracker();
    const drawn = new Map<string, { count: number; accepted: number; example: string }>();
    let accepted = 0;
    let refused = 0;
    checkProperty(
      'P-11.9 decision',
      fc.property(hostileRequest(LIST), (request) => {
        const decision = decideRequest(request.url, LIST);
        const expected = acceptingEntry(request.parts, LIST);
        const hostClass = request.hostClass;
        if (hostClass !== null && request.parts.host !== request.entry.host) {
          const slot = drawn.get(hostClass) ?? {
            count: 0,
            accepted: 0,
            example: request.parts.host,
          };
          slot.count += 1;
          if (decision.ok) slot.accepted += 1;
          drawn.set(hostClass, slot);
        }
        if (expected === null) {
          refused += 1;
          expect(decision, `let through: ${JSON.stringify(request.url)}`).toMatchObject({
            ok: false,
            reason: 'host_not_allowed',
          });
        } else {
          accepted += 1;
          expect(decision, `refused: ${JSON.stringify(request.url)}`).toEqual({
            ok: true,
            value: expected,
          });
        }
      }),
      tracker,
    );
    // The generator draws both verdicts and every class of look-alike host (it is not vacuous).
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    const hostChanges = CHANGE_NAMES.filter((n) => n.startsWith('host ')).length;
    expect(drawn.size).toBeGreaterThanOrEqual(Math.min(hostChanges, isDeepRun() ? 9 : 5));
    for (const [, slot] of drawn) expect(slot.accepted).toBe(0);
    if (isDeepRun()) {
      console.log(
        `[deep] P-11.9 decision: ${accepted} accepted, ${refused} refused; look-alike hosts drawn:\n` +
          [...drawn.entries()]
            .map(
              ([name, s]) =>
                `[deep]   ${name}: ${s.count} drawn, ${s.accepted} let through (e.g. ${JSON.stringify(s.example)})`,
            )
            .join('\n'),
      );
    }
  });

  // Generator domain: positions the wind builder supports (latitude within 89°, longitude in
  // (-π, π]), with both ends of each range drawn. The longitude never equals -π, which is not
  // a Supported position (a test of its own below).
  const supportedPosition = fc
    .tuple(closed(-(89 * Math.PI) / 180, (89 * Math.PI) / 180), closed(-Math.PI, Math.PI))
    .map(([latRad, lonRad]): Position => ({ latRad, lonRad }))
    .filter(isSupportedPosition);

  it('accepts every URL of the wind builder, and names the wind entry', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-11.9 wind builder',
      fc.property(supportedPosition, (position) => {
        const url = windRequestUrl(position, defaultParameters());
        expect(url.ok).toBe(true);
        if (!url.ok) return;
        expect(decideRequest(url.value, LIST)).toEqual({ ok: true, value: WIND_ENTRY });
      }),
      tracker,
    );
  });

  it('draws the generator over both entries of the list (it is not the wind entry alone)', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(hostileRequest(LIST), (request) => {
        seen.add(request.entry.id);
        seen.add(request.entry.path.length === 4 ? `tiles-${request.entry.query.length}` : 'wind');
      }),
      { numRuns: 400 },
    );
    expect([...seen].sort()).toEqual(['tiles', 'tiles-0', 'tiles-1', 'wind']);
  });
});

describe('the oracle of P-11.9 is not the code under test', () => {
  const parts: RequestParts = {
    scheme: 'https',
    userinfo: null,
    host: 'api.open-meteo.com',
    port: null,
    path: ['v1', 'forecast'],
    query: [
      ['latitude', '30.1'],
      ['longitude', '-40.2'],
      ['current', 'wind_speed_10m,wind_direction_10m'],
      ['wind_speed_unit', 'ms'],
      ['timeformat', 'unixtime'],
    ],
    fragment: null,
  };

  it('accepts the entry as it is and refuses each single change of it', () => {
    expect(isAcceptedByEntry(parts, WIND_ENTRY)).toBe(true);
    expect(decideRequest(urlOf(parts), LIST).ok).toBe(true);
    const changed: RequestParts[] = [
      { ...parts, scheme: 'http' },
      { ...parts, userinfo: '' },
      { ...parts, host: 'API.open-meteo.com' },
      { ...parts, host: 'api.open-meteo.com.' },
      { ...parts, port: '' },
      { ...parts, path: ['v1', 'forecast', ''] },
      { ...parts, query: null },
      { ...parts, query: [] },
      { ...parts, query: [...(parts.query ?? []), ['latitude', '30.1']] },
      { ...parts, query: parts.query?.slice(1) ?? null },
      { ...parts, fragment: '' },
    ];
    for (const c of changed) expect(isAcceptedByEntry(c, WIND_ENTRY), urlOf(c)).toBe(false);
  });

  it('a request with a bare question mark is refused even by an entry with no query', () => {
    const tile = LIST[1];
    if (tile === undefined) throw new Error('no tile entry');
    const good: RequestParts = {
      scheme: 'https',
      userinfo: null,
      host: tile.host,
      port: null,
      path: ['base', '1', '2', '3.png'],
      query: null,
      fragment: null,
    };
    expect(isAcceptedByEntry(good, tile)).toBe(true);
    expect(isAcceptedByEntry({ ...good, query: [] }, tile)).toBe(false);
    expect(decideRequest(urlOf({ ...good, query: [] }), LIST).ok).toBe(false);
  });
});
