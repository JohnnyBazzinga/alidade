// The second Transport is not vacuous (Req 9.9): it delivers by the plan, through one shared list
// and one Timer, and so is built differently from the memory network.

import { describe, expect, it } from 'vitest';
import { createMemoryNetwork } from '../adapters/transport/memory-network';
import { createRelayLikeTransport } from './relay-like-transport';
import { FakeTimer } from './fake-timer';

describe('createRelayLikeTransport', () => {
  it('delivers each copy by the plan to every other phone, in the order of their due times', async () => {
    const timer = new FakeTimer();
    const relay = createRelayLikeTransport(
      (_f, _t, code) => [{ copies: code === 'dup' ? 2 : 1, delayMs: code === 'slow' ? 9 : 2 }],
      timer,
    );
    const a = relay.join('A');
    const b = relay.join('B');
    const got: string[] = [];
    b.onReceive((t) => got.push(t));
    await a.send('slow');
    await a.send('dup');
    timer.advance(1);
    expect(got).toEqual([]);
    timer.advance(1);
    expect(got).toEqual(['dup', 'dup']);
    timer.advance(7);
    expect(got).toEqual(['dup', 'dup', 'slow']);
    expect(timer.running()).toBe(0);
  });

  it('uses one Timer for many pending deliveries, where the memory network uses one for each', async () => {
    const plan = () => [{ copies: 3, delayMs: 5 }];
    const relayTimer = new FakeTimer();
    const relay = createRelayLikeTransport(plan, relayTimer);
    const memoryTimer = new FakeTimer();
    const memory = createMemoryNetwork(plan, memoryTimer);
    for (const join of [relay.join.bind(relay), memory.join.bind(memory)]) {
      join('B');
      await join('A').send('x');
    }
    expect(relayTimer.running()).toBe(1);
    expect(memoryTimer.running()).toBe(3);
  });

  it('a stopped phone neither sends nor receives', async () => {
    const timer = new FakeTimer();
    const relay = createRelayLikeTransport(() => [{ copies: 1, delayMs: 3 }], timer);
    const a = relay.join('A');
    const b = relay.join('B');
    const got: string[] = [];
    b.onReceive((t) => got.push(t));
    await a.send('x');
    b.stop();
    timer.advance(10);
    expect(got).toEqual([]);
    expect(await b.send('y')).toEqual({ ok: false, reason: 'transport_unavailable' });
  });
});
