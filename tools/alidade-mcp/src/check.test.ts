import { describe, expect, it } from 'vitest';
import { array, boolean, boundedString, finiteNumber, objectOf } from './check.ts';

describe('finiteNumber', () => {
  it('accepts finite numbers, including -0', () => {
    expect(finiteNumber(1.5, 'x')).toStrictEqual({ ok: true, value: 1.5 });
    expect(finiteNumber(0, 'x')).toStrictEqual({ ok: true, value: 0 });
    expect(finiteNumber(-0, 'x').ok).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity, '1', null, undefined, true, [], {}])(
    'rejects %j and names the field',
    (value) => {
      expect(finiteNumber(value, 'a.b')).toStrictEqual({ ok: false, field: 'a.b' });
    },
  );
});

describe('boundedString', () => {
  it('accepts a string of the allowed length', () => {
    expect(boundedString('abc', 'id', 1, 3)).toStrictEqual({ ok: true, value: 'abc' });
  });

  it.each(['', 'abcd', 5, null, undefined])('rejects %j', (value) => {
    expect(boundedString(value, 'id', 1, 3)).toStrictEqual({ ok: false, field: 'id' });
  });
});

describe('boolean', () => {
  it('accepts true and false only', () => {
    expect(boolean(true, 'b')).toStrictEqual({ ok: true, value: true });
    expect(boolean(false, 'b')).toStrictEqual({ ok: true, value: false });
    expect(boolean(0, 'b')).toStrictEqual({ ok: false, field: 'b' });
    expect(boolean('true', 'b')).toStrictEqual({ ok: false, field: 'b' });
  });
});

describe('array', () => {
  it('accepts an array of the allowed length', () => {
    expect(array([1, 2], 'list', 2, 3)).toStrictEqual({ ok: true, value: [1, 2] });
  });

  it.each([[[1]], [[1, 2, 3, 4]], ['ab'], [{ length: 2 }], [null]])('rejects %j', (value) => {
    expect(array(value, 'list', 2, 3)).toStrictEqual({ ok: false, field: 'list' });
  });
});

describe('objectOf', () => {
  it('accepts an object whose keys are all allowed', () => {
    expect(objectOf({ a: 1 }, 'o', ['a', 'b'])).toStrictEqual({ ok: true, value: { a: 1 } });
  });

  it('names an unknown field with its path', () => {
    expect(objectOf({ a: 1, z: 2 }, 'o', ['a'])).toStrictEqual({ ok: false, field: 'o.z' });
    expect(objectOf({ z: 2 }, '', ['a'])).toStrictEqual({ ok: false, field: 'z' });
  });

  it.each([null, [], 'x', 5, undefined])('rejects %j', (value) => {
    expect(objectOf(value, 'o', ['a'])).toStrictEqual({ ok: false, field: 'o' });
  });

  it('does not accept inherited names such as __proto__ or constructor as known fields', () => {
    const hostile = JSON.parse('{"__proto__": 1}') as unknown;
    expect(objectOf(hostile, 'o', ['a']).ok).toBe(false);
  });
});
