import { describe, expect, it } from 'vitest';
import { exampleA } from '../../test-support/sighting-fixture';
import { defaultParameters } from '../parameters';
import { groupCode } from './alphabet';
import { buildSightingLink, extractSightingCode } from './code-link';
import { decodeSighting } from './sighting-code';

const PARAMETERS = defaultParameters();
const CODE = exampleA().code;
/** A page address of exactly `length` characters on https. */
const addressOfLength = (length: number): string =>
  `https://${'a'.repeat(length - 'https://'.length)}`;

describe('buildSightingLink (Req 10.2, design §7.13)', () => {
  it('is the page address, a #, and the code: 77 characters on https://vigia.example.org/', () => {
    const link = buildSightingLink('https://vigia.example.org/', CODE, PARAMETERS);
    expect(link).toEqual({ ok: true, value: `https://vigia.example.org/#${CODE}` });
    expect(link.ok && link.value.length).toBe(77);
  });

  it('puts the code after the # and nowhere else: not in the path, not in the query', () => {
    const link = buildSightingLink('https://vigia.example.org/app/', CODE, PARAMETERS);
    if (!link.ok) throw new Error('failed');
    const hash = link.value.indexOf('#');
    expect(link.value.slice(0, hash)).toBe('https://vigia.example.org/app/');
    expect(link.value.slice(0, hash)).not.toContain(CODE);
    expect(link.value.slice(hash + 1)).toBe(CODE);
    expect(link.value.split('#')).toHaveLength(2);
    expect(link.value.slice(0, hash)).not.toContain('?');
  });

  it('drops the query and the fragment of the page address', () => {
    for (const address of [
      'https://vigia.example.org/?a=1',
      'https://vigia.example.org/?a=1&b=2#old',
      'https://vigia.example.org/#old',
      'https://vigia.example.org/#',
      'https://vigia.example.org/?',
      'https://vigia.example.org/?x=#y?z',
    ]) {
      expect(buildSightingLink(address, CODE, PARAMETERS), address).toEqual({
        ok: true,
        value: `https://vigia.example.org/#${CODE}`,
      });
    }
  });

  it('gives a link of 160 characters on an address of 109 and link_too_long on 110', () => {
    const fits = buildSightingLink(addressOfLength(109), CODE, PARAMETERS);
    expect(fits.ok && fits.value.length).toBe(160);
    expect(buildSightingLink(addressOfLength(110), CODE, PARAMETERS)).toEqual({
      ok: false,
      reason: 'link_too_long',
    });
    expect(buildSightingLink(addressOfLength(108), CODE, PARAMETERS).ok).toBe(true);
  });

  it('takes the limit from the parameters it is given', () => {
    const small = { ...PARAMETERS, maxLinkLengthChars: 100 };
    expect(buildSightingLink(addressOfLength(49), CODE, small).ok).toBe(true);
    expect(buildSightingLink(addressOfLength(50), CODE, small)).toEqual({
      ok: false,
      reason: 'link_too_long',
    });
  });

  it('accepts http only for localhost and 127.0.0.1, as a developer\u2019s page', () => {
    for (const address of [
      'http://localhost:5173/',
      'http://localhost/',
      'http://127.0.0.1:8080/app',
      'http://localhost',
    ]) {
      expect(buildSightingLink(address, CODE, PARAMETERS).ok, address).toBe(true);
    }
    for (const address of [
      'http://example.org/',
      'http://localhost.example.org/',
      'http://localhostx/',
      'http://127.0.0.10/',
      'http://127.0.0.1.example.org/',
      'ftp://example.org/',
      'example.org/',
      '',
      'https://',
      'https:///path',
      'https://?q=1',
      'https://a b/',
      'https://a\n/',
      'HTTPS://example.org/',
    ]) {
      expect(buildSightingLink(address, CODE, PARAMETERS), address).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'pageAddress',
      });
    }
  });

  it('fails with invalid_number naming code unless it is 50 symbols of the alphabet', () => {
    for (const bad of [
      '',
      CODE.slice(1),
      `${CODE}2`,
      CODE.toLowerCase(),
      groupCode(CODE),
      `${CODE.slice(0, 49)}0`,
    ]) {
      expect(buildSightingLink('https://vigia.example.org/', bad, PARAMETERS), bad).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'code',
      });
    }
  });

  it('names the parameters that are not valid', () => {
    expect(
      buildSightingLink('https://vigia.example.org/', CODE, {
        ...PARAMETERS,
        maxLinkLengthChars: 62,
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'maxLinkLengthChars',
    });
  });
});

describe('extractSightingCode (Req 10.4, 10.9, design §7.13)', () => {
  const link = `https://vigia.example.org/#${CODE}`;
  const extract = (text: string) => extractSightingCode(text, PARAMETERS);

  it('reads the code of a link, of a bare code, of a grouped code and of a code in lines', () => {
    expect(extract(link)).toEqual({ ok: true, value: CODE });
    expect(extract(CODE)).toEqual({ ok: true, value: CODE });
    expect(extract(groupCode(CODE))).toEqual({ ok: true, value: CODE });
    expect(extract(groupCode(CODE).replaceAll('-', '\n'))).toEqual({ ok: true, value: CODE });
    expect(extract(`  ${CODE.slice(0, 20)} \n ${CODE.slice(20)}  `)).toEqual({
      ok: true,
      value: CODE,
    });
  });

  it('reads a link in a message, with text before and after it', () => {
    expect(extract(`Smoke seen from the ridge, please add: ${link} thanks!`)).toEqual({
      ok: true,
      value: CODE,
    });
    expect(extract(`${link}\nSent from my phone`)).toEqual({ ok: true, value: CODE });
  });

  it('reads a link whose code was broken into groups and lines by a messaging app', () => {
    const broken = `https://vigia.example.org/app/#${groupCode(CODE).replaceAll('-', ' ').replace(' ', '\n')}`;
    expect(extract(broken)).toEqual({ ok: true, value: CODE });
    expect(extract(`https://vigia.example.org/#\n${groupCode(CODE)}\n`)).toEqual({
      ok: true,
      value: CODE,
    });
  });

  it('does not read trailing capitals into the code: it stops after 50 symbols of a version-1 code', () => {
    expect(extract(`${link} HELP NEEDED NOW`)).toEqual({ ok: true, value: CODE });
    expect(extract(`${link}\nTHANK YOU`)).toEqual({ ok: true, value: CODE });
    expect(extract(`${link}ABCDEFG`)).toEqual({ ok: true, value: CODE });
  });

  it('reads the first link of a message that has two', () => {
    const other = `https://vigia.example.org/#${CODE.replace('7VGW', '2222')}`;
    expect(extract(`${link} and then ${other}`)).toEqual({ ok: true, value: CODE });
    expect(extract(`${other} and then ${link}`)).toEqual({
      ok: true,
      value: CODE.replace('7VGW', '2222'),
    });
  });

  it('stops at a character that is not a symbol, a space or a hyphen', () => {
    expect(extract(`https://vigia.example.org/#${CODE.slice(0, 10)}.${CODE.slice(10)}`)).toEqual({
      ok: true,
      value: CODE.slice(0, 10),
    });
    expect(extract(`https://vigia.example.org/#${CODE.slice(0, 10)}g${CODE.slice(10)}`)).toEqual({
      ok: true,
      value: CODE.slice(0, 10),
    });
  });

  it('reads at most maxCodeLengthChars symbols of what is not a version-1 code', () => {
    const long = `https://vigia.example.org/#4${'2'.repeat(5000)}`;
    const result = extract(long);
    expect(result.ok && result.value.length).toBe(PARAMETERS.maxCodeLengthChars);
    expect(extractSightingCode(long, { ...PARAMETERS, maxCodeLengthChars: 100 })).toEqual({
      ok: true,
      value: `4${'2'.repeat(99)}`,
    });
  });

  it('says not a sighting for prose without a link, empty text and a link with nothing after the #', () => {
    for (const text of [
      '',
      ' \n ',
      'hello, is anybody there?',
      'see you at the ridge at 5',
      'https://vigia.example.org/',
      'ab-cd',
    ]) {
      expect(extract(text), JSON.stringify(text)).toEqual({
        ok: false,
        reason: 'code_not_a_sighting',
      });
    }
    for (const text of [
      'https://vigia.example.org/#',
      'https://vigia.example.org/# \n',
      'see https://vigia.example.org/#!',
    ]) {
      expect(extract(text), JSON.stringify(text)).toEqual({
        ok: false,
        reason: 'code_not_a_sighting',
      });
    }
  });

  it('returns a text in the alphabet as it is, whatever its length: the decoder judges it', () => {
    expect(extract('234567')).toEqual({ ok: true, value: '234567' });
    expect(extract(CODE.slice(0, 49))).toEqual({ ok: true, value: CODE.slice(0, 49) });
  });

  it('gives a text the decoder reads as the code of the link', () => {
    const extracted = extract(`${link} bye`);
    if (!extracted.ok) throw new Error('failed');
    expect(decodeSighting(extracted.value, PARAMETERS).ok).toBe(true);
  });

  it('matches the scheme without regard to case and reads http links too', () => {
    expect(extract(`HTTPS://vigia.example.org/#${CODE}`)).toEqual({ ok: true, value: CODE });
    expect(extract(`http://localhost:5173/#${CODE}`)).toEqual({ ok: true, value: CODE });
  });

  it('names the parameters that are not valid', () => {
    expect(extractSightingCode(link, { ...PARAMETERS, maxCodeLengthChars: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'maxCodeLengthChars',
    });
  });
});
