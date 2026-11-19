// P-11.9, the gate half (Req 11.1, 11.3, 11.7, 11.9, design §11).
//
// Generator: `hostileRequest` (test-support/hostile-request.ts). The property: the injected fetch is
// called if and only if the oracle accepts the request's parts, and then exactly once with exactly
// the options of design §7.14; a refusal is `host_not_allowed` and the fake was not touched.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHostList, type TileProvider } from '../math/network/host-list';
import { defaultParameters } from '../math/parameters';
import { cappedRuns } from '../test-support/fast-check-setup';
import { createFakeFetch } from '../test-support/fake-fetch';
import { FakeTimer } from '../test-support/fake-timer';
import { acceptingEntry, hostileRequest } from '../test-support/hostile-request';
import { checkPropertyAsync, ErrorTracker } from '../test-support/property-report';
import { createNetworkGate } from './network-gate';

const PROVIDER: TileProvider = {
  host: 'tiles.example-maps.test',
  sourceName: 'Example Maps (synthetic)',
  termsUrl: 'https://example-maps.test/terms',
  attribution: 'Map data by Example Maps',
};
const built = buildHostList(['https://tiles.example-maps.test/base/{z}/{x}/{y}.png'], [PROVIDER]);
if (!built.ok) throw new Error('the test Host list did not build');
const LIST = built.value;

// P-11.9 (gate): Req 11.1, 11.3, 11.7, 11.9.
describe('P-11.9: the gate calls fetch if and only if the decision accepts (Req 11.9)', () => {
  it('calls the injected fetch exactly when the oracle accepts, with exactly the options of §7.14', async () => {
    let calledCases = 0;
    let silentCases = 0;
    await checkPropertyAsync(
      'P-11.9 gate',
      fc.asyncProperty(hostileRequest(LIST), async (request) => {
        const fake = createFakeFetch();
        const made = createNetworkGate(fake.fetchLike, LIST, defaultParameters(), new FakeTimer());
        if (!made.ok) throw new Error('gate not made');
        const result = await made.value.get(request.url);
        if (acceptingEntry(request.parts, LIST) === null) {
          silentCases += 1;
          expect(fake.calls, `reached fetch: ${JSON.stringify(request.url)}`).toEqual([]);
          expect(result).toMatchObject({ ok: false, reason: 'host_not_allowed' });
        } else {
          calledCases += 1;
          expect(result, `refused: ${JSON.stringify(request.url)}`).toEqual({
            ok: true,
            value: 'ok',
          });
          expect(fake.calls).toHaveLength(1);
          const call = fake.calls[0];
          expect(call?.url).toBe(request.url);
          expect(Object.keys(call?.init ?? {}).sort()).toEqual([
            'cache',
            'credentials',
            'headers',
            'method',
            'redirect',
            'referrerPolicy',
            'signal',
          ]);
          expect(call?.init).toMatchObject({
            method: 'GET',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            redirect: 'error',
            cache: 'no-store',
            headers: {},
          });
        }
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(2000) },
    );
    expect(calledCases).toBeGreaterThan(0);
    expect(silentCases).toBeGreaterThan(0);
  });
});
