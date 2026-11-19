// `decideRequest` (Req 11.3, 11.9, design §7.14 steps 1 to 6): each look-alike of Req 11.9 refused
// with the step that refuses it, and the requests that are accepted. P-11.9's decision half is in
// `gate-decision.property.test.ts`.

import { describe, expect, it } from 'vitest';
import { decideRequest } from './gate-decision';
import { buildHostList, WIND_ENTRY, type TileProvider } from './host-list';

const WIND =
  'https://api.open-meteo.com/v1/forecast?latitude=30.1&longitude=-40.2' +
  '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timeformat=unixtime';

const PROVIDER: TileProvider = {
  host: 'tiles.example-maps.test',
  sourceName: 'Example Maps (synthetic)',
  termsUrl: 'https://example-maps.test/terms',
  attribution: 'Map data by Example Maps',
};
const built = buildHostList(['https://tiles.example-maps.test/base/{z}/{x}/{y}.png'], [PROVIDER]);
if (!built.ok) throw new Error('the test Host list did not build');
const LIST = built.value;

function refusal(url: string): { reason: string; field: string | undefined } {
  const result = decideRequest(url, LIST);
  if (result.ok) throw new Error(`accepted: ${url}`);
  return { reason: result.reason, field: result.field };
}

const REFUSED = (field: string) => ({ reason: 'host_not_allowed', field });

describe('the accepted requests', () => {
  it('the wind URL is accepted and names the wind entry', () => {
    expect(decideRequest(WIND, LIST)).toEqual({ ok: true, value: WIND_ENTRY });
  });

  it('a tile URL of the built entry is accepted', () => {
    const result = decideRequest('https://tiles.example-maps.test/base/3/4/5.png', LIST);
    expect(result.ok && result.value.id).toBe('tiles');
    const edge = decideRequest('https://tiles.example-maps.test/base/0/0/0.png', LIST);
    expect(edge.ok).toBe(true);
  });

  it('the query parameters may come in any order', () => {
    const reordered =
      'https://api.open-meteo.com/v1/forecast?timeformat=unixtime&wind_speed_unit=ms' +
      '&current=wind_speed_10m,wind_direction_10m&longitude=-40.2&latitude=30.1';
    expect(decideRequest(reordered, LIST).ok).toBe(true);
  });

  it('a number has no decimals or one, and may be negative', () => {
    for (const [lat, lon] of [
      ['0', '0'],
      ['-0.0', '180'],
      ['89', '-179.9'],
    ] as const) {
      expect(decideRequest(WIND.replace('30.1', lat).replace('-40.2', lon), LIST).ok).toBe(true);
    }
  });
});

describe('the look-alikes of Req 11.9, each refused at its step', () => {
  it.each([
    [
      'a listed host as the prefix of another host',
      WIND.replace('api.open-meteo.com', 'api.open-meteo.com.evil.test'),
      'host',
    ],
    [
      'a listed host as a suffix label',
      WIND.replace('api.open-meteo.com', 'evil.api.open-meteo.com'),
      'host',
    ],
    [
      'the at-sign trick',
      WIND.replace('api.open-meteo.com', 'api.open-meteo.com@evil.test'),
      'userinfo',
    ],
    [
      'the at-sign trick, the other way',
      WIND.replace('api.open-meteo.com', 'evil.test@api.open-meteo.com'),
      'userinfo',
    ],
    ['upper case', WIND.replace('api.open-meteo.com', 'API.open-meteo.com'), 'canonical'],
    ['a trailing dot', WIND.replace('api.open-meteo.com', 'api.open-meteo.com.'), 'host'],
    [
      'an IDN look-alike (Cyrillic a)',
      WIND.replace('api.open-meteo.com', 'api.open-meteo.c\u043em'),
      'canonical',
    ],
    ['a port', WIND.replace('open-meteo.com', 'open-meteo.com:8443'), 'port'],
    [
      'the default port written out',
      WIND.replace('open-meteo.com', 'open-meteo.com:443'),
      'canonical',
    ],
    ['userinfo', WIND.replace('https://', 'https://user:pw@'), 'userinfo'],
    ['empty userinfo', WIND.replace('https://', 'https://@'), 'canonical'],
    ['http', WIND.replace('https', 'http'), 'scheme'],
    ['ftp', WIND.replace('https', 'ftp'), 'scheme'],
    ['a fragment', `${WIND}#frag`, 'fragment'],
    ['an empty fragment', `${WIND}#`, 'fragment'],
    ['another host', WIND.replace('api.open-meteo.com', 'example.org'), 'host'],
    ['an IP address', WIND.replace('api.open-meteo.com', '127.0.0.1'), 'host'],
  ])('%s', (_name, url, field) => {
    expect(refusal(url)).toEqual(REFUSED(field));
  });

  it.each([
    ['a missing parameter', WIND.replace('&timeformat=unixtime', ''), 'query'],
    ['a repeated parameter', `${WIND}&latitude=30.1`, 'query'],
    ['an extra parameter', `${WIND}&x=1`, 'query'],
    ['an empty query', 'https://api.open-meteo.com/v1/forecast?', 'query'],
    ['no query', 'https://api.open-meteo.com/v1/forecast', 'query'],
    ['a wrong literal value', WIND.replace('ms', 'kmh'), 'query'],
    ['two decimals', WIND.replace('30.1', '30.12'), 'query'],
    ['a letter for a number', WIND.replace('30.1', 'abc'), 'query'],
    ['an empty number', WIND.replace('latitude=30.1', 'latitude='), 'query'],
    ['an exponent', WIND.replace('30.1', '3e1'), 'query'],
    ['a plus sign', WIND.replace('30.1', '+30.1'), 'query'],
    ['a percent-encoded point', WIND.replace('30.1', '30%2E1'), 'query'],
    ['a percent-encoded comma', WIND.replace('10m,wind', '10m%2Cwind'), 'query'],
    ['a parameter name in upper case', WIND.replace('latitude', 'Latitude'), 'query'],
    ['a trailing ampersand', `${WIND}&`, 'query'],
    ['a pair with no equals sign', `${WIND}&flag`, 'query'],
  ])('%s', (_name, url, field) => {
    expect(refusal(url)).toEqual(REFUSED(field));
  });

  it.each([
    ['a trailing slash', WIND.replace('/forecast?', '/forecast/?'), 'path'],
    ['a different version', WIND.replace('/v1/', '/v2/'), 'path'],
    ['a missing segment', WIND.replace('/v1/forecast?', '/v1?'), 'path'],
    ['an extra segment', WIND.replace('/forecast?', '/forecast/extra?'), 'path'],
    ['an empty segment', WIND.replace('/v1/', '//v1/'), 'path'],
    ['percent-encoded letters', WIND.replace('/v1/', '/%76%31/'), 'path'],
    ['an upper-case segment', WIND.replace('/forecast', '/Forecast'), 'path'],
    ['a dot segment', WIND.replace('/v1/forecast', '/v1/./forecast'), 'canonical'],
    ['a dot-dot segment', WIND.replace('/v1/forecast', '/v1/x/../forecast'), 'canonical'],
    ['a backslash', WIND.replace('/v1/forecast', '/v1\\forecast'), 'canonical'],
    ['no path slash', 'https://api.open-meteo.com?latitude=30.1', 'canonical'],
  ])('%s', (_name, url, field) => {
    expect(refusal(url)).toEqual(REFUSED(field));
  });

  it.each([
    ['a tile of the wrong suffix', 'https://tiles.example-maps.test/base/3/4/5.jpg', 'path'],
    ['a tile with a letter coordinate', 'https://tiles.example-maps.test/base/3/x/5.png', 'path'],
    ['a negative coordinate', 'https://tiles.example-maps.test/base/-3/4/5.png', 'path'],
    ['a decimal coordinate', 'https://tiles.example-maps.test/base/3.5/4/5.png', 'path'],
    ['an empty coordinate', 'https://tiles.example-maps.test/base//4/5.png', 'path'],
    ['a tile with a query', 'https://tiles.example-maps.test/base/3/4/5.png?x=1', 'query'],
    ['a tile with an empty query', 'https://tiles.example-maps.test/base/3/4/5.png?', 'query'],
    ['an unfilled template', 'https://tiles.example-maps.test/base/%7Bz%7D/4/5.png', 'path'],
    ['a tile from the wrong base', 'https://tiles.example-maps.test/other/3/4/5.png', 'path'],
    [
      'the tile host with the wind path',
      WIND.replace('api.open-meteo.com', 'tiles.example-maps.test'),
      'path',
    ],
    ['the wind host with a tile path', 'https://api.open-meteo.com/base/3/4/5.png', 'path'],
  ])('%s', (_name, url, field) => {
    expect(refusal(url)).toEqual(REFUSED(field));
  });

  it.each([
    ['not a URL', 'not a url', 'url'],
    ['empty', '', 'url'],
    ['a relative path', '/v1/forecast', 'url'],
    ['leading whitespace', ` ${WIND}`, 'canonical'],
    ['trailing whitespace', `${WIND} `, 'canonical'],
    ['a newline inside', WIND.replace('v1/', 'v1\n/'), 'canonical'],
    ['a tab inside', WIND.replace('forecast', 'fore\tcast'), 'canonical'],
  ])('%s', (_name, url, field) => {
    expect(refusal(url)).toEqual(REFUSED(field));
  });

  it('the Host list with no entry refuses everything, the wind URL included', () => {
    expect(decideRequest(WIND, [])).toEqual({
      ok: false,
      reason: 'host_not_allowed',
      field: 'host',
    });
  });

  it('an entry whose host is listed twice accepts what either entry accepts', () => {
    const twin = buildHostList(
      [
        'https://tiles.example-maps.test/a/{z}/{x}/{y}.png',
        'https://tiles.example-maps.test/b/{z}/{x}/{y}.png',
      ],
      [PROVIDER],
    );
    if (!twin.ok) throw new Error('did not build');
    expect(decideRequest('https://tiles.example-maps.test/a/1/2/3.png', twin.value).ok).toBe(true);
    expect(decideRequest('https://tiles.example-maps.test/b/1/2/3.png', twin.value).ok).toBe(true);
    expect(decideRequest('https://tiles.example-maps.test/c/1/2/3.png', twin.value).ok).toBe(false);
  });
});
