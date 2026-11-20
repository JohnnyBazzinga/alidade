import { describe, expect, it } from 'vitest';
import { createFakeStorage } from './fake-storage';

describe('createFakeStorage', () => {
  it('stores, reads and removes, and starts from what it is given', () => {
    const f = createFakeStorage({ a: '1' });
    expect(f.getItem('a')).toBe('1');
    f.setItem('b', '2');
    expect(f.getItem('b')).toBe('2');
    f.removeItem('a');
    expect(f.getItem('a')).toBeNull();
  });

  it('throws an error with the named name when told to, per method', () => {
    const f = createFakeStorage();
    f.failing = { setItem: 'QuotaExceededError' };
    expect(() => f.setItem('a', 'b')).toThrow(
      expect.objectContaining({ name: 'QuotaExceededError' }),
    );
    expect(f.getItem('a')).toBeNull();
    expect(f.items.size).toBe(0);
  });
});
