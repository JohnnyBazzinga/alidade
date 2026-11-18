import { describe, expect, it } from 'vitest';
import { ListenerSet } from './listener-set';

describe('ListenerSet (Req 11.11, D22)', () => {
  it('delivers in registration order, isolating a listener that throws', () => {
    const errors: unknown[] = [];
    const set = new ListenerSet<number>((error) => errors.push(error));
    const received: string[] = [];
    const thrown = new Error('second listener');
    set.add((v) => received.push(`a${v}`));
    set.add(() => {
      throw thrown;
    });
    set.add((v) => received.push(`c${v}`));
    for (let v = 1; v <= 5; v += 1) set.deliver(v);
    expect(received).toEqual(['a1', 'c1', 'a2', 'c2', 'a3', 'c3', 'a4', 'c4', 'a5', 'c5']);
    expect(errors).toHaveLength(5);
    expect(errors.every((e) => e === thrown)).toBe(true);
  });

  it('drops errors without a callback, and drops what a throwing callback throws', () => {
    for (const set of [
      new ListenerSet<number>(),
      new ListenerSet<number>(() => {
        throw new Error('callback');
      }),
    ]) {
      const received: number[] = [];
      set.add(() => {
        throw 'not an Error';
      });
      set.add((v) => received.push(v));
      expect(() => {
        set.deliver(1);
        set.deliver(2);
      }).not.toThrow();
      expect(received).toEqual([1, 2]);
    }
  });

  it('lets a listener unsubscribe itself, or a later one, during delivery', () => {
    const set = new ListenerSet<number>();
    const received: string[] = [];
    let unsubscribeC = () => {};
    const unsubscribeA = set.add((v) => {
      received.push(`a${v}`);
      unsubscribeA();
      unsubscribeC();
    });
    set.add((v) => received.push(`b${v}`));
    unsubscribeC = set.add((v) => received.push(`c${v}`));
    set.deliver(1);
    set.deliver(2);
    expect(received).toEqual(['a1', 'b1', 'b2']);
    expect(set.size).toBe(1);
  });

  it('treats the same function added twice as two registrations', () => {
    const set = new ListenerSet<number>();
    let count = 0;
    const listener = () => {
      count += 1;
    };
    const first = set.add(listener);
    set.add(listener);
    set.deliver(0);
    first();
    set.deliver(0);
    expect(count).toBe(3);
  });
});
