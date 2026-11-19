import { describe, expect, it } from 'vitest';
import {
  ALPHABET,
  ALPHABET_SIZE,
  groupCode,
  isAlphabetString,
  stripCode,
  symbolAt,
  symbolValue,
} from './alphabet';

describe('ALPHABET (Req 8.2, design §7.2)', () => {
  it('is the 31 symbols: the digits 2 to 9 and the letters but I, L and O, in this order', () => {
    expect(ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    expect(ALPHABET_SIZE).toBe(31);
    expect(ALPHABET).toHaveLength(31);
    expect(new Set(ALPHABET).size).toBe(31);
  });

  it('holds none of 0, 1, I, L, O, no lower case and nothing a messaging app or a URL alters', () => {
    for (const forbidden of ['0', '1', 'I', 'L', 'O']) expect(ALPHABET).not.toContain(forbidden);
    expect(ALPHABET).toMatch(/^[2-9A-Z]+$/);
    for (const altered of [' ', '+', '/', '=', '%', '&', '?', '#', '-', '_', '.']) {
      expect(ALPHABET).not.toContain(altered);
    }
  });

  it('values run from 2 = 0 to Z = 30, and symbolAt is the inverse of symbolValue', () => {
    expect(symbolValue('2')).toBe(0);
    expect(symbolValue('9')).toBe(7);
    expect(symbolValue('A')).toBe(8);
    expect(symbolValue('H')).toBe(15);
    expect(symbolValue('Z')).toBe(30);
    for (let value = 0; value < 31; value += 1) {
      expect(symbolValue(symbolAt(value) ?? '')).toBe(value);
    }
  });

  it('gives no value to a character outside the alphabet: no case folding, no look-alike mapping', () => {
    for (const outside of [
      '0',
      '1',
      'I',
      'L',
      'O',
      'a',
      'z',
      'i',
      'l',
      'o',
      ' ',
      '-',
      '',
      '22',
      '\u0662',
    ]) {
      expect(symbolValue(outside), JSON.stringify(outside)).toBeNull();
    }
    expect(symbolAt(-1)).toBeNull();
    expect(symbolAt(31)).toBeNull();
    expect(symbolAt(1.5)).toBeNull();
    expect(symbolAt(Number.NaN)).toBeNull();
  });

  it('isAlphabetString tells a string of symbols from anything else, the empty string included', () => {
    expect(isAlphabetString('')).toBe(true);
    expect(isAlphabetString(ALPHABET)).toBe(true);
    expect(isAlphabetString('23-45')).toBe(false);
    expect(isAlphabetString('abc')).toBe(false);
    expect(isAlphabetString('2 3')).toBe(false);
    expect(isAlphabetString('2O')).toBe(false);
  });
});

describe('groupCode (design §7.13, §8.6)', () => {
  const code = '327VGW67HFXYW4EP3NHT3AFXPGBQKU927W36FR8FF326RWB8GH';

  it('writes 50 symbols as ten groups of five joined by hyphens: 59 characters', () => {
    expect(code).toHaveLength(50);
    const grouped = groupCode(code);
    expect(grouped).toBe('327VG-W67HF-XYW4E-P3NHT-3AFXP-GBQKU-927W3-6FR8F-F326R-WB8GH');
    expect(grouped).toHaveLength(59);
    expect(grouped.split('-')).toHaveLength(10);
  });

  it('is undone by stripCode', () => {
    expect(stripCode(groupCode(code))).toBe(code);
  });

  it('groups any length: a shorter last group, and nothing for the empty string', () => {
    expect(groupCode('')).toBe('');
    expect(groupCode('23456')).toBe('23456');
    expect(groupCode('234567')).toBe('23456-7');
    expect(groupCode('2345678923')).toBe('23456-78923');
  });
});

describe('stripCode (Req 8.2)', () => {
  it('removes spaces, tabs, line breaks and hyphens, and nothing else', () => {
    expect(stripCode(' 327VG-W67HF\nXYW4E\t P3NHT\r\n-3AFXP ')).toBe('327VGW67HFXYW4EP3NHT3AFXP');
    expect(stripCode('')).toBe('');
    expect(stripCode(' - \n ')).toBe('');
  });

  it('does not fold case or touch a character outside the alphabet', () => {
    expect(stripCode('ab-0O1')).toBe('ab0O1');
    expect(stripCode('2\u00a03')).toBe('23'); // a non-breaking space is whitespace
  });
});
