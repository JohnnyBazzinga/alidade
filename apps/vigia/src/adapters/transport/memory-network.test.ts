// The in-memory network (Req 9.2, design §7.19): one send to several phones, and a delivery plan
// that makes loss, duplication, delay and reordering deterministic.

import { describe, expect, it } from 'vitest';
import type { DeliveryPlan, TransportStatus } from '../../math/transport/transport';
import { FakeTimer } from '../../test-support/fake-timer';
import { createMemoryNetwork, DIRECT_DELIVERY, MAX_COPIES_PER_STEP } from './memory-network';

function setup(
  plan: DeliveryPlan = DIRECT_DELIVERY,
  phoneIds: readonly string[] = ['A', 'B', 'C', 'D'],
) {
  const timer = new FakeTimer();
  const network = createMemoryNetwork(plan, timer);
  const phones = phoneIds.map((id) => {
    const transport = network.join(id);
    const received: string[] = [];
    transport.onReceive((text) => received.push(text));
    return { id, transport, received };
  });
  const phone = (id: string) => {
    const found = phones.find((p) => p.id === id);
    if (found === undefined) throw new Error(`no phone ${id}`);
    return found;
  };
  return { timer, network, phones, phone };
}

describe('one send to three phones with the default plan', () => {
  it('delivers the code once to each other phone and not to the sender', async () => {
    const { phones, phone, timer } = setup();
    expect(await phone('A').transport.send('CODE-1')).toEqual({ ok: true, value: undefined });
    timer.advance(1000);
    expect(phones.map((p) => p.received)).toEqual([[], ['CODE-1'], ['CODE-1'], ['CODE-1']]);
  });

  it('delivers at once, with no Timer, when the delay is 0', async () => {
    const { phone, timer } = setup();
    await phone('A').transport.send('X');
    expect(phone('B').received).toEqual(['X']);
    expect(timer.running()).toBe(0);
  });

  it('asks the plan for every other phone with the sender, the recipient, the code and the sequence', async () => {
    const asked: unknown[][] = [];
    const { phone } = setup((from, to, code, sequence) => {
      asked.push([from, to, code, sequence]);
      return [{ copies: 1, delayMs: 0 }];
    });
    await phone('B').transport.send('one');
    await phone('C').transport.send('two');
    expect(asked).toEqual([
      ['B', 'A', 'one', 0],
      ['B', 'C', 'one', 0],
      ['B', 'D', 'one', 0],
      ['C', 'A', 'two', 1],
      ['C', 'B', 'two', 1],
      ['C', 'D', 'two', 1],
    ]);
  });

  it('does not deliver to a phone that joins after the send', async () => {
    const { network, phone } = setup();
    await phone('A').transport.send('early');
    const late = network.join('E');
    const received: string[] = [];
    late.onReceive((t) => received.push(t));
    expect(received).toEqual([]);
  });
});

describe('each delivery plan', () => {
  it('loss: a plan of [] delivers nothing', async () => {
    const { phones, phone, timer } = setup(() => []);
    await phone('A').transport.send('lost');
    timer.advance(10_000);
    expect(phones.flatMap((p) => p.received)).toEqual([]);
  });

  it('loss of one copy of three: zero copies is also nothing', async () => {
    const { phone, timer } = setup((_f, to) =>
      to === 'B' ? [{ copies: 0, delayMs: 5 }] : [{ copies: 1, delayMs: 0 }],
    );
    await phone('A').transport.send('x');
    timer.advance(100);
    expect(phone('B').received).toEqual([]);
    expect(phone('C').received).toEqual(['x']);
  });

  it('duplication: copies 2 delivers the code twice to each phone', async () => {
    const { phone, timer } = setup(() => [{ copies: 2, delayMs: 0 }]);
    await phone('A').transport.send('twice');
    timer.advance(100);
    expect(phone('B').received).toEqual(['twice', 'twice']);
    expect(phone('D').received).toEqual(['twice', 'twice']);
  });

  it('several steps are all made', async () => {
    const { phone, timer } = setup(() => [
      { copies: 1, delayMs: 0 },
      { copies: 1, delayMs: 20 },
    ]);
    await phone('A').transport.send('s');
    expect(phone('B').received).toEqual(['s']);
    timer.advance(19);
    expect(phone('B').received).toEqual(['s']);
    timer.advance(1);
    expect(phone('B').received).toEqual(['s', 's']);
  });

  it('delay and reordering: a later send with a shorter delay arrives first, each at its time', async () => {
    const delays = new Map([
      ['first', 10],
      ['second', 3],
    ]);
    const { phone, timer } = setup((_f, _t, code) => [
      { copies: 1, delayMs: delays.get(code) ?? 0 },
    ]);
    await phone('A').transport.send('first');
    await phone('A').transport.send('second');
    expect(phone('B').received).toEqual([]);
    timer.advance(2);
    expect(phone('B').received).toEqual([]);
    timer.advance(1);
    expect(phone('B').received).toEqual(['second']);
    timer.advance(6);
    expect(phone('B').received).toEqual(['second']);
    timer.advance(1);
    expect(phone('B').received).toEqual(['second', 'first']);
  });

  it('leaves no Timer running once every delivery is made', async () => {
    const { phone, timer } = setup(() => [{ copies: 3, delayMs: 7 }]);
    await phone('A').transport.send('x');
    expect(timer.running()).toBeGreaterThan(0);
    timer.advance(7);
    expect(timer.running()).toBe(0);
  });
});

describe('a step that is not a delivery plan', () => {
  it('delivers nothing: a copy count that is not a whole number of 0 to 16, or a delay that is not finite and at least 0', async () => {
    const invalid = [
      { copies: Number.NaN, delayMs: 0 },
      { copies: Number.POSITIVE_INFINITY, delayMs: 0 },
      { copies: -1, delayMs: 0 },
      { copies: 1.5, delayMs: 0 },
      { copies: MAX_COPIES_PER_STEP + 1, delayMs: 0 },
      { copies: 1, delayMs: Number.NaN },
      { copies: 1, delayMs: Number.POSITIVE_INFINITY },
      { copies: 1, delayMs: -1 },
    ];
    for (const step of invalid) {
      const { phone, timer } = setup(() => [step]);
      await phone('A').transport.send('x');
      timer.advance(1_000_000);
      expect(phone('B').received, JSON.stringify(step)).toEqual([]);
      expect(timer.running()).toBe(0);
    }
  });

  it('delivers the most copies a step may make, and the delay 0 it starts at', async () => {
    const { phone } = setup(() => [{ copies: MAX_COPIES_PER_STEP, delayMs: 0 }]);
    await phone('A').transport.send('x');
    expect(phone('B').received).toHaveLength(MAX_COPIES_PER_STEP);
    expect(MAX_COPIES_PER_STEP).toBe(16);
  });
});

describe('stop() leaves the network (Req 9.1)', () => {
  it('a stopped phone receives nothing more, not even what was already on its way', async () => {
    const { phone, timer } = setup(() => [{ copies: 1, delayMs: 10 }]);
    await phone('A').transport.send('on its way');
    phone('B').transport.stop();
    timer.advance(100);
    expect(phone('B').received).toEqual([]);
    expect(phone('C').received).toEqual(['on its way']);
  });

  it('the plan is not asked about a stopped phone, and its own sends are transport_unavailable', async () => {
    const asked: string[] = [];
    const { phone } = setup((_f, to) => {
      asked.push(to);
      return [{ copies: 1, delayMs: 0 }];
    });
    phone('B').transport.stop();
    await phone('A').transport.send('x');
    expect(asked).toEqual(['C', 'D']);
    expect(await phone('B').transport.send('y')).toEqual({
      ok: false,
      reason: 'transport_unavailable',
    });
    expect(phone('C').received).toEqual(['x']);
  });

  it('stopping twice is harmless', () => {
    const { phone } = setup();
    phone('A').transport.stop();
    expect(() => phone('A').transport.stop()).not.toThrow();
  });
});

describe('the text is never parsed (Req 9.1)', () => {
  it('delivers arbitrary text exactly as it was sent', async () => {
    const texts = [
      '',
      ' ',
      'not a code',
      '\u0000<script>',
      '\u{1F525}',
      'A'.repeat(10_000),
      'ZZZZ-ZZZZ\n',
    ];
    const { phone } = setup();
    for (const text of texts) await phone('A').transport.send(text);
    expect(phone('B').received).toEqual(texts);
  });
});

describe('status', () => {
  it('says available when subscribed, and unavailable (transport_unavailable) after stop', () => {
    const { phone } = setup();
    const seen: TransportStatus[] = [];
    phone('A').transport.onStatus((s) => seen.push(s));
    expect(seen).toEqual([{ kind: 'available' }]);
    phone('A').transport.stop();
    expect(seen).toEqual([
      { kind: 'available' },
      { kind: 'unavailable', reason: 'transport_unavailable' },
    ]);
  });

  it('an unsubscribed listener hears nothing more', async () => {
    const { phone } = setup();
    const got: string[] = [];
    const off = phone('B').transport.onReceive((t) => got.push(t));
    await phone('A').transport.send('one');
    off();
    await phone('A').transport.send('two');
    expect(got).toEqual(['one']);
  });

  it('a listener that throws does not stop the others', async () => {
    const { network, phone } = setup();
    const extra = network.join('Z');
    extra.onReceive(() => {
      throw new Error('listener failed');
    });
    const ok: string[] = [];
    extra.onReceive((t) => ok.push(t));
    await expect(phone('A').transport.send('x')).resolves.toEqual({ ok: true, value: undefined });
    expect(ok).toEqual(['x']);
    expect(phone('B').received).toEqual(['x']);
  });
});
