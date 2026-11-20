import { describe, expect, it } from 'vitest';
import { wrappedLines } from './wrapped-lines';

describe('wrappedLines', () => {
  it('counts the lines of a greedy wrap at 0.63 em a character', () => {
    // 100 px at 10 px a font: 15 characters a line.
    expect(wrappedLines('one two three', 100, 10)).toBe(1);
    expect(wrappedLines('one two three four five', 100, 10)).toBe(2);
    expect(wrappedLines('abcdefghijklmnopqrstuvwxyz0123', 100, 10)).toBe(2);
    expect(wrappedLines('', 100, 10)).toBe(1);
  });
});
