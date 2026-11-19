// The Host list (Req 11.2, 11.4, design §4 D14, §6): the entries as data, and `buildHostList`, which
// turns the tile templates of the environment into entries and refuses a template whose host is
// not listed.

import { describe, expect, it } from 'vitest';
import {
  buildHostList,
  HOST_LIST,
  LISTED_TILE_PROVIDERS,
  WIND_ENTRY,
  type TileProvider,
} from './host-list';

const PROVIDER: TileProvider = {
  host: 'tiles.example-maps.test',
  sourceName: 'Example Maps (synthetic)',
  termsUrl: 'https://example-maps.test/terms',
  attribution: 'Map data by Example Maps',
};
const OTHER: TileProvider = { ...PROVIDER, host: 'mirror.example-maps.test' };

const TEMPLATE = 'https://tiles.example-maps.test/base/{z}/{x}/{y}.png';

describe('the wind entry (Req 11.2, 13.2)', () => {
  it('names the host, the exact path and the five query parameters of the request', () => {
    expect(WIND_ENTRY.id).toBe('wind');
    expect(WIND_ENTRY.host).toBe('api.open-meteo.com');
    expect(WIND_ENTRY.path).toEqual([
      { kind: 'literal', value: 'v1' },
      { kind: 'literal', value: 'forecast' },
    ]);
    expect(WIND_ENTRY.query).toEqual([
      { name: 'latitude', value: { kind: 'number', maxDecimals: 1 } },
      { name: 'longitude', value: { kind: 'number', maxDecimals: 1 } },
      { name: 'current', value: { kind: 'literal', value: 'wind_speed_10m,wind_direction_10m' } },
      { name: 'wind_speed_unit', value: { kind: 'literal', value: 'ms' } },
      { name: 'timeformat', value: { kind: 'literal', value: 'unixtime' } },
    ]);
  });

  it('says in words what it carries, names its Source and its terms, and needs no key', () => {
    expect(WIND_ENTRY.sourceName).toBe('Open-Meteo');
    expect(WIND_ENTRY.purpose).toBe('wind');
    expect(WIND_ENTRY.carries).toMatch(/one point/i);
    expect(WIND_ENTRY.carries).toMatch(/network address/i);
    expect(WIND_ENTRY.termsUrl).toMatch(/^https:\/\//);
    expect(WIND_ENTRY.attribution).toMatch(/CC BY 4\.0/);
    expect(WIND_ENTRY.needsKey).toBe(false);
    expect(WIND_ENTRY.keyIsPublic).toBe(false);
  });
});

describe('the listed entries of the first release', () => {
  it('are the wind entry alone: no tile provider is listed until the owner chooses one (O7)', () => {
    expect(HOST_LIST).toEqual([WIND_ENTRY]);
    expect(LISTED_TILE_PROVIDERS).toEqual([]);
  });
});

describe('buildHostList (Req 11.4)', () => {
  it('with no template is the wind entry alone', () => {
    expect(buildHostList([], [PROVIDER])).toEqual({ ok: true, value: [WIND_ENTRY] });
  });

  it('turns a listed template into a tiles entry whose path is the template', () => {
    const built = buildHostList([TEMPLATE], [PROVIDER]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value).toHaveLength(2);
    const tiles = built.value[1];
    expect(tiles).toMatchObject({
      id: 'tiles',
      host: 'tiles.example-maps.test',
      sourceName: 'Example Maps (synthetic)',
      purpose: 'tiles',
      termsUrl: 'https://example-maps.test/terms',
      attribution: 'Map data by Example Maps',
      query: [],
      needsKey: false,
    });
    expect(tiles?.path).toEqual([
      { kind: 'literal', value: 'base' },
      { kind: 'tileCoordinate', suffix: '' },
      { kind: 'tileCoordinate', suffix: '' },
      { kind: 'tileCoordinate', suffix: '.png' },
    ]);
    expect(tiles?.carries).toMatch(/tile/i);
  });

  it('keeps a literal query of the template, and takes several templates and hosts', () => {
    const built = buildHostList(
      [
        'https://tiles.example-maps.test/{z}/{x}/{y}.jpg?style=plain',
        'https://mirror.example-maps.test/{z}/{x}/{y}.jpg',
      ],
      [PROVIDER, OTHER],
    );
    expect(built.ok && built.value.map((e) => e.host)).toEqual([
      'api.open-meteo.com',
      'tiles.example-maps.test',
      'mirror.example-maps.test',
    ]);
    expect(built.ok && built.value[1]?.query).toEqual([
      { name: 'style', value: { kind: 'literal', value: 'plain' } },
    ]);
  });

  it('refuses a template whose host is not listed, naming the host', () => {
    expect(buildHostList(['https://evil.test/{z}/{x}/{y}.png'], [PROVIDER])).toEqual({
      ok: false,
      reason: 'host_not_allowed',
      field: 'host',
    });
  });

  it('lists no tile host by default, so that every template is refused until the owner lists one', () => {
    expect(buildHostList([TEMPLATE])).toEqual({
      ok: false,
      reason: 'host_not_allowed',
      field: 'host',
    });
  });

  it.each([
    ['a prefix label', 'https://evil.tiles.example-maps.test/{z}/{x}/{y}.png', 'host'],
    ['a suffix label', 'https://tiles.example-maps.test.evil.test/{z}/{x}/{y}.png', 'host'],
    ['a trailing dot', 'https://tiles.example-maps.test./{z}/{x}/{y}.png', 'host'],
    ['upper case', 'https://TILES.example-maps.test/{z}/{x}/{y}.png', 'host'],
    ['userinfo', 'https://u@tiles.example-maps.test/{z}/{x}/{y}.png', 'host'],
    ['userinfo as the host', 'https://tiles.example-maps.test@evil.test/{z}/{x}/{y}.png', 'host'],
    ['a port', 'https://tiles.example-maps.test:8443/{z}/{x}/{y}.png', 'host'],
    ['a placeholder in the host', 'https://{s}.example-maps.test/{z}/{x}/{y}.png', 'host'],
  ])('refuses %s in the host', (_name, template, field) => {
    expect(buildHostList([template], [PROVIDER])).toEqual({
      ok: false,
      reason: 'host_not_allowed',
      field,
    });
  });

  it.each([
    ['http', 'http://tiles.example-maps.test/{z}/{x}/{y}.png', 'scheme'],
    ['no scheme', 'tiles.example-maps.test/{z}/{x}/{y}.png', 'scheme'],
    ['empty', '', 'scheme'],
    ['no {y}', 'https://tiles.example-maps.test/{z}/{x}.png', 'template'],
    ['no {z}', 'https://tiles.example-maps.test/{x}/{y}.png', 'template'],
    ['{z} twice', 'https://tiles.example-maps.test/{z}/{z}/{x}/{y}.png', 'template'],
    ['an unknown placeholder', 'https://tiles.example-maps.test/{q}/{z}/{x}/{y}.png', 'template'],
    ['a placeholder with a prefix', 'https://tiles.example-maps.test/a{z}/{x}/{y}.png', 'template'],
    ['a stray brace', 'https://tiles.example-maps.test/{z}/{x}/{y}.png}', 'template'],
    ['a fragment', 'https://tiles.example-maps.test/{z}/{x}/{y}.png#a', 'template'],
    [
      'a placeholder in the query',
      'https://tiles.example-maps.test/{z}/{x}/{y}.png?k={z}',
      'template',
    ],
    ['an empty segment', 'https://tiles.example-maps.test//{z}/{x}/{y}.png', 'template'],
    ['whitespace', 'https://tiles.example-maps.test/{z}/{x}/{y}.png ', 'template'],
  ])('refuses a template that is not a tile template: %s', (_name, template, field) => {
    expect(buildHostList([template], [PROVIDER])).toEqual({
      ok: false,
      reason: 'host_not_allowed',
      field,
    });
  });

  it('refuses the whole list when one template is bad', () => {
    expect(
      buildHostList([TEMPLATE, 'https://evil.test/{z}/{x}/{y}.png'], [PROVIDER]),
    ).toMatchObject({ ok: false, reason: 'host_not_allowed' });
  });
});
