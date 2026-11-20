// The tile source from the build environment (Req 11.4, 18.6; the lead's decision of 2026-11-21):
// four variables name the provider, so no host is written in the source. With all four present
// and valid, the provider is built from them (its host is the template's) and the Host list holds
// its entry, so that a tile of that host is accepted by the gate's decision and no other host is.
// With any missing, the plain background and no failure. An invalid template is `host_not_allowed`.
// Hosts here are synthetic names under `.test`.

import { describe, expect, it } from 'vitest';
import { decideRequest } from './gate-decision';
import { WIND_ENTRY } from './host-list';
import { tileSetupFromEnvironment, type TileEnvironment } from './tile-setup';

const GOOD: TileEnvironment = {
  urlTemplate: 'https://tiles.provider.test/base/{z}/{x}/{y}.png',
  attribution: 'Map data by the Provider, CC BY',
  sourceName: 'Provider Maps',
  termsUrl: 'https://provider.test/terms',
};

const setup = (env: Partial<TileEnvironment>) => tileSetupFromEnvironment({ ...GOOD, ...env });

describe('tileSetupFromEnvironment: all four present and valid', () => {
  it('builds the provider from the four values, its host being the template’s', () => {
    const result = setup({});
    if (!result.ok || result.value === null) throw new Error('no setup');
    const { value } = result;
    expect(value.tileUrlTemplates).toEqual([GOOD.urlTemplate]);
    expect(value.attribution).toBe(GOOD.attribution);
    expect(value.sourceName).toBe(GOOD.sourceName);
    expect(value.termsUrl).toBe(GOOD.termsUrl);
    const tiles = value.hostList.find((e) => e.id === 'tiles');
    expect(tiles?.host).toBe('tiles.provider.test');
    expect(tiles?.sourceName).toBe('Provider Maps');
    expect(tiles?.termsUrl).toBe('https://provider.test/terms');
    expect(tiles?.attribution).toBe(GOOD.attribution);
    expect(value.hostList.find((e) => e.id === 'wind')).toEqual(WIND_ENTRY);
  });

  it('lets that host’s tiles through the gate’s decision and nothing else', () => {
    const result = setup({});
    if (!result.ok || result.value === null) throw new Error('no setup');
    const { hostList } = result.value;
    expect(decideRequest('https://tiles.provider.test/base/12/2048/1361.png', hostList).ok).toBe(
      true,
    );
    for (const url of [
      'https://tiles.provider.test/other/12/2048/1361.png',
      'https://tiles.provider.test/base/12/2048/1361.jpg',
      'https://provider.test/base/12/2048/1361.png',
      'https://tiles.provider.test.evil.test/base/12/2048/1361.png',
      'http://tiles.provider.test/base/12/2048/1361.png',
      'https://elsewhere.test/anything',
    ]) {
      const decision = decideRequest(url, hostList);
      expect(decision.ok, url).toBe(false);
      if (!decision.ok) expect(decision.reason).toBe('host_not_allowed');
    }
  });

  it('accepts several whitespace-separated templates of one host', () => {
    const result = setup({
      urlTemplate: ` https://tiles.provider.test/a/{z}/{x}/{y}.png\n\thttps://tiles.provider.test/b/{z}/{x}/{y}.png `,
    });
    if (!result.ok || result.value === null) throw new Error('no setup');
    expect(result.value.tileUrlTemplates).toEqual([
      'https://tiles.provider.test/a/{z}/{x}/{y}.png',
      'https://tiles.provider.test/b/{z}/{x}/{y}.png',
    ]);
    expect(result.value.hostList.filter((e) => e.id === 'tiles')).toHaveLength(2);
  });

  it('trims the text values', () => {
    const result = setup({
      attribution: '  Data by P.  ',
      sourceName: ' P ',
      termsUrl: ' https://p.test/t ',
    });
    if (!result.ok || result.value === null) throw new Error('no setup');
    expect(result.value.attribution).toBe('Data by P.');
    expect(result.value.sourceName).toBe('P');
    expect(result.value.termsUrl).toBe('https://p.test/t');
  });
});

describe('tileSetupFromEnvironment: any of the four missing', () => {
  for (const name of ['urlTemplate', 'attribution', 'sourceName', 'termsUrl'] as const) {
    it(`gives no tile source and no failure when ${name} is empty`, () => {
      expect(setup({ [name]: '' })).toEqual({ ok: true, value: null });
    });
    it(`gives no tile source and no failure when ${name} is only white space`, () => {
      expect(setup({ [name]: ' \n\t ' })).toEqual({ ok: true, value: null });
    });
    it(`gives no tile source and no failure when ${name} is undefined`, () => {
      expect(setup({ [name]: undefined })).toEqual({ ok: true, value: null });
    });
  }

  it('gives none when all four are missing', () => {
    expect(tileSetupFromEnvironment({})).toEqual({ ok: true, value: null });
  });
});

describe('tileSetupFromEnvironment: all four present, a template invalid', () => {
  const cases: readonly [string, string, string][] = [
    ['not https', 'http://tiles.provider.test/{z}/{x}/{y}.png', 'scheme'],
    ['no scheme', 'tiles.provider.test/{z}/{x}/{y}.png', 'scheme'],
    ['a coordinate missing', 'https://tiles.provider.test/{z}/{x}.png', 'template'],
    ['a coordinate twice', 'https://tiles.provider.test/{z}/{x}/{x}/{y}.png', 'template'],
    ['a fragment', 'https://tiles.provider.test/{z}/{x}/{y}.png#a', 'template'],
    ['userinfo in the host', 'https://user@tiles.provider.test/{z}/{x}/{y}.png', 'host'],
    ['no path', 'https://tiles.provider.test', 'template'],
  ];
  for (const [name, template, field] of cases) {
    it(`shows host_not_allowed for ${name}`, () => {
      const result = setup({ urlTemplate: template });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('host_not_allowed');
        expect(result.field).toBe(field);
      }
    });
  }

  it('shows host_not_allowed when one of two templates is invalid', () => {
    const result = setup({
      urlTemplate:
        'https://tiles.provider.test/{z}/{x}/{y}.png http://tiles.provider.test/{z}/{x}/{y}.png',
    });
    expect(result.ok).toBe(false);
  });

  it('shows host_not_allowed for a terms address that is not an https address', () => {
    for (const termsUrl of [
      'http://provider.test/terms',
      'provider.test/terms',
      'https://a b.test/',
    ]) {
      const result = setup({ termsUrl });
      expect(result.ok, termsUrl).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('host_not_allowed');
        expect(result.field).toBe('termsUrl');
      }
    }
  });
});
