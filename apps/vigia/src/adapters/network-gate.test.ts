// The Network gate (Req 11.1, 11.3, 11.7, 11.9, design §7.14), against a fake `fetch` and the
// fake Timer. P-11.9's gate half is in `network-gate.property.test.ts`.

import { describe, expect, it } from 'vitest';
import { buildHostList, HOST_LIST, type TileProvider } from '../math/network/host-list';
import { defaultParameters, type VigiaParameters } from '../math/parameters';
import { bytesOf, createFakeFetch, type FakeBehaviour } from '../test-support/fake-fetch';
import { FakeTimer } from '../test-support/fake-timer';
import { createNetworkGate, type NetworkGate } from './network-gate';

const WIND =
  'https://api.open-meteo.com/v1/forecast?latitude=30.1&longitude=-40.2' +
  '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timeformat=unixtime';

const SMALL: VigiaParameters = { ...defaultParameters(), maxResponseBytes: 10 };

function gateOf(
  behaviour: FakeBehaviour | ((url: string) => FakeBehaviour),
  parameters: VigiaParameters = defaultParameters(),
) {
  const fake = createFakeFetch((url) =>
    typeof behaviour === 'function' ? behaviour(url) : behaviour,
  );
  const timer = new FakeTimer();
  const made = createNetworkGate(fake.fetchLike, HOST_LIST, parameters, timer);
  if (!made.ok) throw new Error(`gate not made: ${made.reason}`);
  return { fake, timer, gate: made.value as NetworkGate };
}

const text = (body: string, status = 200): FakeBehaviour => ({ kind: 'text', status, text: body });
const stream = (chunks: Uint8Array[], status = 200): FakeBehaviour => ({
  kind: 'stream',
  status,
  chunks,
});

describe('a request that the Host list allows (Req 11.7)', () => {
  it('returns the body of the response', async () => {
    const { gate } = gateOf(text('{"current":{}}'));
    expect(await gate.get(WIND)).toEqual({ ok: true, value: '{"current":{}}' });
  });

  it('is sent with exactly the options of design §7.14 and no header, no body', async () => {
    const { gate, fake } = gateOf(text('x'));
    await gate.get(WIND);
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(call?.url).toBe(WIND);
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
    expect(call?.init.signal.aborted).toBe(false);
  });

  it('has no method but get', () => {
    const { gate } = gateOf(text('x'));
    expect(Object.keys(gate)).toEqual(['get']);
  });

  it('reads a streamed body whose chunks split a multi-byte character', async () => {
    const bytes = bytesOf('é'); // two bytes
    const { gate } = gateOf(stream([bytes.slice(0, 1), bytes.slice(1)]));
    expect(await gate.get(WIND)).toEqual({ ok: true, value: 'é' });
  });

  it('leaves no Timer running after a success, a failure or a refusal', async () => {
    for (const behaviour of [
      text('x'),
      text('x', 503),
      { kind: 'reject', error: new TypeError('x') } as const,
    ]) {
      const { gate, timer } = gateOf(behaviour);
      await gate.get(WIND);
      expect(timer.running()).toBe(0);
    }
    const { gate, timer } = gateOf(text('x'));
    await gate.get('https://example.org/');
    expect(timer.running()).toBe(0);
  });
});

describe('a request the Host list does not allow (Req 11.3)', () => {
  it('is refused with host_not_allowed and never reaches fetch', async () => {
    const { gate, fake, timer } = gateOf(text('x'));
    for (const url of [
      'https://example.org/',
      'http://api.open-meteo.com/v1/forecast',
      WIND.replace('30.1', '30.12'),
      `${WIND}#x`,
      'not a url',
      '',
    ]) {
      const result = await gate.get(url);
      expect(result).toMatchObject({ ok: false, reason: 'host_not_allowed' });
    }
    expect(fake.calls).toEqual([]);
    expect(timer.running()).toBe(0);
  });

  it('names the step that refused in field', async () => {
    const { gate } = gateOf(text('x'));
    expect(await gate.get('https://example.org/')).toEqual({
      ok: false,
      reason: 'host_not_allowed',
      field: 'host',
    });
  });

  it('allows a tile URL once a tile entry is in the list, and nothing the entry does not state', async () => {
    const provider: TileProvider = {
      host: 'tiles.example-maps.test',
      sourceName: 'Example Maps (synthetic)',
      termsUrl: 'https://example-maps.test/terms',
      attribution: 'x',
    };
    const list = buildHostList(['https://tiles.example-maps.test/{z}/{x}/{y}.png'], [provider]);
    if (!list.ok) throw new Error('list');
    const fake = createFakeFetch();
    const made = createNetworkGate(
      fake.fetchLike,
      list.value,
      defaultParameters(),
      new FakeTimer(),
    );
    if (!made.ok) throw new Error('gate');
    expect((await made.value.get('https://tiles.example-maps.test/1/2/3.png')).ok).toBe(true);
    expect((await made.value.get('https://tiles.example-maps.test/1/2/3.png?a=b')).ok).toBe(false);
    expect(fake.calls).toHaveLength(1);
  });
});

describe('a request that fails is overlay_unavailable with the cause in errorName (Req 11.7)', () => {
  const failure = (errorName: string) => ({ ok: false, reason: 'overlay_unavailable', errorName });

  it('a rejected fetch is offline', async () => {
    const { gate } = gateOf({ kind: 'reject', error: new TypeError('Failed to fetch') });
    expect(await gate.get(WIND)).toEqual(failure('offline'));
  });

  it('a rejection that is not an Error is offline, and one with another name keeps its name', async () => {
    expect(await gateOf({ kind: 'reject', error: 'boom' }).gate.get(WIND)).toEqual(
      failure('offline'),
    );
    const named = new Error('x');
    named.name = 'SecurityError';
    expect(await gateOf({ kind: 'reject', error: named }).gate.get(WIND)).toEqual(
      failure('SecurityError'),
    );
  });

  it('a fetch that throws at once is a failure value, not an exception', async () => {
    const { gate } = gateOf({ kind: 'throw', error: new Error('sync') });
    expect(await gate.get(WIND)).toMatchObject({ ok: false, reason: 'overlay_unavailable' });
  });

  it('a status that is not a success is status-<code>', async () => {
    for (const status of [503, 404, 429, 301, 199]) {
      expect(await gateOf(text('x', status)).gate.get(WIND)).toEqual(failure(`status-${status}`));
    }
    expect((await gateOf(text('x', 204)).gate.get(WIND)).ok).toBe(true);
  });

  it('a response that does not answer is aborted by the Timer at the timeout: timeout', async () => {
    const { gate, fake, timer } = gateOf({ kind: 'hang' });
    let result: unknown = 'pending';
    const pending = gate.get(WIND).then((r) => {
      result = r;
    });
    timer.advance(defaultParameters().requestTimeoutMs - 1);
    await Promise.resolve();
    expect(result).toBe('pending');
    expect(fake.calls[0]?.init.signal.aborted).toBe(false);
    timer.advance(1);
    await pending;
    expect(result).toEqual(failure('timeout'));
    expect(fake.calls[0]?.init.signal.aborted).toBe(true);
    expect(timer.running()).toBe(0);
  });

  it('a body that stops coming is cut at the timeout too', async () => {
    const { gate, timer } = gateOf({
      kind: 'stream',
      status: 200,
      chunks: [bytesOf('abc')],
      hangAfter: true,
    });
    const pending = gate.get(WIND);
    timer.advance(defaultParameters().requestTimeoutMs);
    expect(await pending).toEqual(failure('timeout'));
  });

  it('a body that fails half way, and a text() that fails, are failure values', async () => {
    const broken = gateOf({ kind: 'stream', status: 200, chunks: [bytesOf('a')], failAfter: true });
    expect(await broken.gate.get(WIND)).toMatchObject({ ok: false, reason: 'overlay_unavailable' });
    const noText = gateOf({ kind: 'text', status: 200, text: 'x', textFails: true });
    expect(await noText.gate.get(WIND)).toMatchObject({ ok: false, reason: 'overlay_unavailable' });
  });
});

describe('the size limit of the response (Req 11.7, 19.1)', () => {
  const tooLarge = { ok: false, reason: 'overlay_unavailable', errorName: 'too-large' };

  it('a streamed body of exactly the limit is read, one byte more is too-large', async () => {
    expect(await gateOf(stream([bytesOf('0123456789')]), SMALL).gate.get(WIND)).toEqual({
      ok: true,
      value: '0123456789',
    });
    expect(await gateOf(stream([bytesOf('01234567890')]), SMALL).gate.get(WIND)).toEqual(tooLarge);
  });

  it('a streamed body is counted across chunks and the stream is cancelled at the limit', async () => {
    const chunks = Array.from({ length: 6 }, () => bytesOf('abcd'));
    const { gate, fake } = gateOf(stream(chunks), SMALL);
    expect(await gate.get(WIND)).toEqual(tooLarge);
    // 4, 8, 12 bytes: the third chunk passes the limit of 10, so three chunks were read, not six.
    expect(fake.chunksRead).toBe(3);
    expect(fake.cancelled).toBe(1);
    expect(fake.calls[0]?.init.signal.aborted).toBe(true);
  });

  it('a text body of exactly the limit is returned, one byte more is too-large', async () => {
    expect(await gateOf(text('0123456789'), SMALL).gate.get(WIND)).toEqual({
      ok: true,
      value: '0123456789',
    });
    expect(await gateOf(text('01234567890'), SMALL).gate.get(WIND)).toEqual(tooLarge);
  });

  it('counts bytes, not characters: six two-byte characters are twelve bytes', async () => {
    expect(await gateOf(text('éééééé'), SMALL).gate.get(WIND)).toEqual(tooLarge);
    expect(await gateOf(stream([bytesOf('éééééé')]), SMALL).gate.get(WIND)).toEqual(tooLarge);
  });

  it('a body over the limit with a failing status is the status, not the size', async () => {
    expect(await gateOf(text('01234567890', 503), SMALL).gate.get(WIND)).toMatchObject({
      errorName: 'status-503',
    });
  });
});

describe('no unhandled rejection (Req 2.1)', () => {
  it('every failure above settles the promise of get and leaves nothing unhandled', async () => {
    // The Node process, read without its type (the package has no `@types/node`).
    const proc = Reflect.get(globalThis, 'process') as {
      on(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
      off(event: 'unhandledRejection', listener: (reason: unknown) => void): void;
    };
    const seen: unknown[] = [];
    const listener = (reason: unknown) => seen.push(reason);
    proc.on('unhandledRejection', listener);
    try {
      for (const behaviour of [
        { kind: 'reject', error: new TypeError('x') },
        { kind: 'throw', error: new Error('x') },
        { kind: 'hang' },
        text('x', 500),
        { kind: 'stream', status: 200, chunks: [bytesOf('a')], failAfter: true },
      ] as FakeBehaviour[]) {
        const { gate, timer } = gateOf(behaviour);
        const pending = gate.get(WIND);
        timer.advance(defaultParameters().requestTimeoutMs);
        await pending;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    } finally {
      proc.off('unhandledRejection', listener);
    }
    expect(seen).toEqual([]);
  });
});

describe('the parameters (Req 19.3)', () => {
  it('invalid parameters are invalid_number naming the field, and no gate is made', () => {
    const fake = createFakeFetch();
    for (const field of ['requestTimeoutMs', 'maxResponseBytes'] as const) {
      const made = createNetworkGate(
        fake.fetchLike,
        HOST_LIST,
        { ...defaultParameters(), [field]: Number.NaN },
        new FakeTimer(),
      );
      expect(made).toEqual({ ok: false, reason: 'invalid_number', field });
    }
  });
});
