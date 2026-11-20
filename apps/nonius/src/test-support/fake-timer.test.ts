import { describe, expect, it } from 'vitest';
import { FakeTimer } from './fake-timer';

describe('FakeTimer', () => {
  it('runs a callback every interval, only as time is advanced', () => {
    const timer = new FakeTimer();
    const calls: number[] = [];
    timer.start(() => calls.push(timer.nowMs()), 100);
    expect(calls).toEqual([]);
    timer.advance(99);
    expect(calls).toEqual([]);
    timer.advance(1);
    expect(calls).toEqual([100]);
    timer.advance(250);
    expect(calls).toEqual([100, 200, 300]);
    expect(timer.nowMs()).toBe(350);
  });

  it('runs due callbacks of several timers in order of their due time', () => {
    const timer = new FakeTimer();
    const order: string[] = [];
    timer.start(() => order.push('slow'), 30);
    timer.start(() => order.push('fast'), 20);
    timer.advance(60);
    expect(order).toEqual(['fast', 'slow', 'fast', 'slow', 'fast']);
  });

  it('stops a timer, twice without harm', () => {
    const timer = new FakeTimer();
    let count = 0;
    const handle = timer.start(() => (count += 1), 10);
    timer.advance(25);
    timer.stop(handle);
    timer.stop(handle);
    timer.advance(100);
    expect(count).toBe(2);
    expect(timer.running()).toBe(0);
  });

  it('lets a callback stop its own timer (a one-shot)', () => {
    const timer = new FakeTimer();
    let count = 0;
    const handle = timer.start(() => {
      count += 1;
      timer.stop(handle);
    }, 10);
    timer.advance(100);
    expect(count).toBe(1);
  });

  it('treats a non-positive or non-finite interval as 1 ms rather than looping forever', () => {
    const timer = new FakeTimer();
    let count = 0;
    timer.start(() => (count += 1), 0);
    timer.start(() => (count += 1), Number.NaN);
    timer.advance(3);
    expect(count).toBe(6);
  });
});
