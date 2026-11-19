// The Host list (Req 11.2, 11.4, design D14, §6): every host Vigia may send a request to, as data.
// This is the only module that names a host (a purity rule). Each entry states the purpose, the
// Source's name, what the request carries in words and as the exact path and query, the link to
// the Source's terms, and whether it needs a key.
//
// The hotspot entry of the second release is not written. The tile provider is the owner's open
// question (O7): `LISTED_TILE_PROVIDERS` is empty, so that no tile template is accepted until the
// owner lists a provider and has read its terms; `buildHostList` takes the list as an argument so
// that the tests list a synthetic one.

import { err, ok, type VigiaResult } from '../../result';

/**
 * What one segment of a path, or one value of a query, may be:
 *  - `literal`: exactly this text;
 *  - `oneOf`: exactly one of these texts;
 *  - `number`: `-` optional, digits, and at most `maxDecimals` digits after one point;
 *  - `tileCoordinate`: digits (a tile number) followed by exactly `suffix` (`''` or `.png`).
 * The `key` and `area` kinds of design §6 come with the hotspot Overlay (second release).
 */
export type ValueKind =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'oneOf'; readonly values: readonly string[] }
  | { readonly kind: 'number'; readonly maxDecimals: number }
  | { readonly kind: 'tileCoordinate'; readonly suffix: string };

export interface HostEntry {
  readonly id: 'tiles' | 'wind';
  readonly sourceName: string;
  /** `'tiles'` or `'wind'` (the hotspot Overlay adds `'hotspots'`). */
  readonly purpose: string;
  /** The host exactly as the standard URL parser writes it. */
  readonly host: string;
  /** One kind per path segment after the first `/`. */
  readonly path: readonly ValueKind[];
  /** The query parameters: each name once, in any order, with a value of its kind. */
  readonly query: readonly { readonly name: string; readonly value: ValueKind }[];
  /** What the request carries, in words (Req 11.2, 15.3). */
  readonly carries: string;
  /** The link to the Source's terms of use; the owner reads and accepts them (O6, O7). */
  readonly termsUrl: string;
  readonly attribution: string;
  readonly needsKey: boolean;
  /** True when a key is needed and is visible to everyone who opens the page (Req 11.6). */
  readonly keyIsPublic: boolean;
}

export type HostList = readonly HostEntry[];

/** A tile provider the owner has chosen and whose terms the owner has read (open question O7). */
export interface TileProvider {
  readonly host: string;
  readonly sourceName: string;
  readonly termsUrl: string;
  readonly attribution: string;
}

/**
 * The tile providers the owner has listed. Empty until the owner decides (O7: "a public demo link
 * is not published before the terms are read"): with none listed, every tile template is refused
 * and the map has the plain background (Req 11.4, 11.8).
 */
export const LISTED_TILE_PROVIDERS: readonly TileProvider[] = [];

const literal = (value: string): ValueKind => ({ kind: 'literal', value });

/**
 * The wind Source of the first release: Open-Meteo, no key. As the lead found them on 2026-11-18
 * (open question O6): attribution required under CC BY 4.0, free use non-commercial and under
 * 10 000 calls a day. The owner accepts the terms before a public link.
 */
export const WIND_ENTRY: HostEntry = {
  id: 'wind',
  sourceName: 'Open-Meteo',
  purpose: 'wind',
  host: 'api.open-meteo.com',
  path: [literal('v1'), literal('forecast')],
  query: [
    { name: 'latitude', value: { kind: 'number', maxDecimals: 1 } },
    { name: 'longitude', value: { kind: 'number', maxDecimals: 1 } },
    { name: 'current', value: literal('wind_speed_10m,wind_direction_10m') },
    { name: 'wind_speed_unit', value: literal('ms') },
    { name: 'timeformat', value: literal('unixtime') },
  ],
  carries:
    "One point, rounded to a grid of 0.1 degrees (about 11 km), and the phone's network address. " +
    'No identifier, no time, no direction of a sighting.',
  termsUrl: 'https://open-meteo.com/en/terms',
  attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  needsKey: false,
  keyIsPublic: false,
};

/** The hosts of the first release as listed: the wind Source alone. */
export const HOST_LIST: HostList = [WIND_ENTRY];

// --- tile templates ---------------------------------------------------------------------------

const SEGMENT_LITERAL = /^[A-Za-z0-9._~-]+$/;
const SEGMENT_PLACEHOLDER = /^\{([zxy])\}([A-Za-z0-9._-]*)$/;
const QUERY_NAME = /^[A-Za-z0-9_.-]+$/;
const QUERY_VALUE = /^[A-Za-z0-9_.,-]+$/;

const refuse = (field: string) => err('host_not_allowed', { field });

/** The entry of one tile template of a listed provider, or the refusal. */
function tileEntry(template: string, providers: readonly TileProvider[]): VigiaResult<HostEntry> {
  if (typeof template !== 'string' || !template.startsWith('https://')) return refuse('scheme');
  const rest = template.slice('https://'.length);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  const provider = providers.find((p) => p.host === authority);
  if (provider === undefined) return refuse('host');
  const afterHost = authorityEnd < 0 ? '' : rest.slice(authorityEnd);
  if (afterHost.includes('#') || !afterHost.startsWith('/')) return refuse('template');
  const queryStart = afterHost.indexOf('?');
  const pathText = queryStart < 0 ? afterHost : afterHost.slice(0, queryStart);
  const queryText = queryStart < 0 ? null : afterHost.slice(queryStart + 1);

  const path: ValueKind[] = [];
  const seen: string[] = [];
  for (const segment of pathText.slice(1).split('/')) {
    const placeholder = SEGMENT_PLACEHOLDER.exec(segment);
    if (placeholder !== null) {
      seen.push(placeholder[1] ?? '');
      path.push({ kind: 'tileCoordinate', suffix: placeholder[2] ?? '' });
    } else if (SEGMENT_LITERAL.test(segment) && segment !== '.' && segment !== '..') {
      path.push(literal(segment));
    } else return refuse('template');
  }
  if (['z', 'x', 'y'].some((name) => seen.filter((s) => s === name).length !== 1)) {
    return refuse('template');
  }

  const query: { name: string; value: ValueKind }[] = [];
  if (queryText !== null) {
    for (const pair of queryText.split('&')) {
      const at = pair.indexOf('=');
      const name = at < 0 ? '' : pair.slice(0, at);
      const value = at < 0 ? '' : pair.slice(at + 1);
      if (!QUERY_NAME.test(name) || !QUERY_VALUE.test(value)) return refuse('template');
      if (query.some((q) => q.name === name)) return refuse('template');
      query.push({ name, value: literal(value) });
    }
  }

  return ok({
    id: 'tiles',
    sourceName: provider.sourceName,
    purpose: 'tiles',
    host: provider.host,
    path,
    query,
    carries:
      "The tile numbers of the map area on the screen (zoom, column, row) and the phone's network " +
      'address. Nothing else: no sighting, no position of an observer.',
    termsUrl: provider.termsUrl,
    attribution: provider.attribution,
    needsKey: false,
    keyIsPublic: false,
  });
}

/**
 * The Host list for this run: the wind entry, and one tiles entry for each tile template of the
 * environment (Req 11.4). A template whose host is not one of `providers`, or that is not a tile
 * template (https, a listed host, `{z}`, `{x}` and `{y}` once each in the path, a literal query),
 * is refused with `host_not_allowed` naming `scheme`, `host` or `template`; the caller then starts
 * with no Tile source.
 */
export function buildHostList(
  tileTemplates: readonly string[],
  providers: readonly TileProvider[] = LISTED_TILE_PROVIDERS,
): VigiaResult<HostList> {
  const entries: HostEntry[] = [WIND_ENTRY];
  for (const template of tileTemplates) {
    const entry = tileEntry(template, providers);
    if (!entry.ok) return entry;
    entries.push(entry.value);
  }
  return ok(entries);
}
