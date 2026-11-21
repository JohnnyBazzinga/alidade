import { describe, expect, it } from 'vitest';
import { createFramer } from './framing.ts';

const line = (text: string) => ({ kind: 'line', text });
const TOO_LONG = { kind: 'too-long' };

describe('createFramer (Req 5.2)', () => {
  it('splits complete lines', () => {
    const framer = createFramer(100);
    expect(framer.push('a\nbb\nccc\n')).toStrictEqual([line('a'), line('bb'), line('ccc')]);
  });

  it('joins a line split across chunks', () => {
    const framer = createFramer(100);
    expect(framer.push('hel')).toStrictEqual([]);
    expect(framer.push('lo\nwor')).toStrictEqual([line('hello')]);
    expect(framer.push('ld\n')).toStrictEqual([line('world')]);
  });

  it('removes a carriage return before the newline and skips empty lines', () => {
    const framer = createFramer(100);
    expect(framer.push('a\r\n\n\r\nb\n')).toStrictEqual([line('a'), line('b')]);
  });

  it('returns the last line without a newline from end()', () => {
    const framer = createFramer(100);
    expect(framer.push('a\nlast')).toStrictEqual([line('a')]);
    expect(framer.end()).toStrictEqual([line('last')]);
    expect(framer.end()).toStrictEqual([]);
  });

  it('accepts a line of exactly the maximum length', () => {
    const framer = createFramer(10);
    expect(framer.push('0123456789\n')).toStrictEqual([line('0123456789')]);
  });

  it('discards a line over the maximum, reports it once, and carries on after its newline', () => {
    const framer = createFramer(10);
    expect(framer.push('01234567890\nok\n')).toStrictEqual([TOO_LONG, line('ok')]);
  });

  it('reports a too long line once even when it comes in many chunks, and resynchronises', () => {
    const framer = createFramer(10);
    expect(framer.push('0123456')).toStrictEqual([]);
    expect(framer.push('789012')).toStrictEqual([TOO_LONG]);
    expect(framer.push('3456789')).toStrictEqual([]);
    expect(framer.push('xyz\nnext\n')).toStrictEqual([line('next')]);
  });

  it('reports nothing more from end() for a too long line without a newline', () => {
    const framer = createFramer(10);
    expect(framer.push('01234567890123')).toStrictEqual([TOO_LONG]);
    expect(framer.end()).toStrictEqual([]);
  });

  it('keeps no text across a too long line (memory stays bounded)', () => {
    const framer = createFramer(10);
    for (let i = 0; i < 1000; i++) framer.push('x'.repeat(1000));
    expect(framer.push('\nok\n')).toStrictEqual([line('ok')]);
  });
});
