// `hostileRequest` (design §11, Req 11.9): a request built from parts, so that the verdict is known
// by construction. Test support, not exported.
//
// Domain. Every draw starts from a request that is exactly one Host list entry's (its host, its
// path, its query names with valid values; for a tile entry, three coordinates and the suffix), then
// applies 0 to 3 changes, each independently one of:
//   scheme   `http`, `ftp`, `HTTPS`;
//   userinfo `user`, `user:pw`, the empty string (`https://@host/`);
//   host     a prefix label, a suffix label, a trailing dot, upper case, `host@other` as the whole
//            host part, an IDN look-alike (the first `a` replaced by Cyrillic `а`), a tab inside the
//            host, another listed-looking host (`example.org`, `localhost`), the host of another
//            entry, `host.` plus a label;
//   port     `443`, `8443`, the empty port (`host:`);
//   path     a segment removed, a segment added, an empty segment added (a trailing slash), a
//            segment replaced by `.`, `..`, the empty string, an upper-case or percent-encoded or
//            space-holding or longer variant of itself;
//   query    absent, empty (`?`), a pair removed, a pair repeated, an extra pair, a value replaced by
//            a bad text (empty, a letter, a longer value, a percent-encoded value, an exponent), the
//            pairs in another order (this one keeps the request valid);
//   fragment `#`, `#x`.
// It excludes: control characters other than the tab, strings that are not made of the parts above,
// and anything that makes the parts disagree with the string (the string is built from the parts).
//
// The oracle (`isAcceptedByEntry`) compares the parts with the entry's data character by character.
// It never calls `URL`, and it shares no code with `decideRequest`.

import fc from 'fast-check';
import type { HostEntry, HostList, ValueKind } from '../math/network/host-list';

export interface RequestParts {
  readonly scheme: string;
  /** `null` for none; the empty string means `scheme://@host`. */
  readonly userinfo: string | null;
  readonly host: string;
  /** `null` for none; the empty string means `host:`. */
  readonly port: string | null;
  /** The path segments after the first `/`. */
  readonly path: readonly string[];
  /** `null` for no `?`; an empty list means a bare `?`. */
  readonly query: readonly (readonly [name: string, value: string])[] | null;
  /** `null` for no `#`; the empty string means a bare `#`. */
  readonly fragment: string | null;
}

export interface HostileRequest {
  readonly url: string;
  readonly parts: RequestParts;
  readonly entry: HostEntry;
  /** The names of the changes applied, for the report of what was drawn. */
  readonly changes: readonly string[];
  /** A set when the host differs from the entry's: the look-alike class drawn. */
  readonly hostClass: string | null;
}

export function urlOf(parts: RequestParts): string {
  const userinfo = parts.userinfo === null ? '' : `${parts.userinfo}@`;
  const port = parts.port === null ? '' : `:${parts.port}`;
  const query =
    parts.query === null ? '' : `?${parts.query.map(([k, v]) => `${k}=${v}`).join('&')}`;
  const fragment = parts.fragment === null ? '' : `#${parts.fragment}`;
  return `${parts.scheme}://${userinfo}${parts.host}${port}/${parts.path.join('/')}${query}${fragment}`;
}

// --- the oracle: parts against data, character by character ---------------------------------

const DIGITS = '0123456789';

function allDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (const c of text) if (!DIGITS.includes(c)) return false;
  return true;
}

/** `-?digits` with at most `maxDecimals` digits after one point, written without a regex. */
function isNumberText(text: string, maxDecimals: number): boolean {
  const body = text.startsWith('-') ? text.slice(1) : text;
  const point = body.indexOf('.');
  if (point < 0) return allDigits(body);
  if (maxDecimals < 1) return false;
  const decimals = body.slice(point + 1);
  return allDigits(body.slice(0, point)) && allDigits(decimals) && decimals.length <= maxDecimals;
}

function valueMatches(kind: ValueKind, text: string): boolean {
  switch (kind.kind) {
    case 'literal':
      return text === kind.value;
    case 'oneOf':
      return kind.values.includes(text);
    case 'number':
      return isNumberText(text, kind.maxDecimals);
    case 'tileCoordinate':
      return (
        text.endsWith(kind.suffix) && allDigits(text.slice(0, text.length - kind.suffix.length))
      );
  }
}

/** True when the parts are exactly a request the entry allows (Req 11.9). */
export function isAcceptedByEntry(parts: RequestParts, entry: HostEntry): boolean {
  if (parts.scheme !== 'https') return false;
  if (parts.userinfo !== null || parts.port !== null || parts.fragment !== null) return false;
  if (parts.host !== entry.host) return false;
  if (parts.path.length !== entry.path.length) return false;
  for (let i = 0; i < entry.path.length; i += 1) {
    const kind = entry.path[i];
    const segment = parts.path[i];
    if (kind === undefined || segment === undefined || !valueMatches(kind, segment)) return false;
  }
  // An entry with no query allows no `?` at all (not even a bare one).
  if (entry.query.length === 0) return parts.query === null;
  if (parts.query === null) return false;
  if (parts.query.length !== entry.query.length) return false;
  for (const wanted of entry.query) {
    const found = parts.query.filter(([name]) => name === wanted.name);
    const only = found[0];
    if (found.length !== 1 || only === undefined || !valueMatches(wanted.value, only[1])) {
      return false;
    }
  }
  return true;
}

/** The first entry of the list (in order) that accepts the parts, or `null`. */
export function acceptingEntry(parts: RequestParts, hostList: HostList): HostEntry | null {
  return hostList.find((entry) => isAcceptedByEntry(parts, entry)) ?? null;
}

// --- the starting request of an entry ---------------------------------------------------------

function goodNumberText(maxDecimals: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.boolean(),
      fc.integer({ min: 0, max: 180 }),
      fc.option(fc.integer({ min: 0, max: 9 }), { nil: null }),
    )
    .map(([negative, whole, decimal]) => {
      const fraction = decimal === null || maxDecimals < 1 ? '' : `.${decimal}`;
      return `${negative ? '-' : ''}${whole}${fraction}`;
    });
}

function goodValue(kind: ValueKind): fc.Arbitrary<string> {
  switch (kind.kind) {
    case 'literal':
      return fc.constant(kind.value);
    case 'oneOf':
      return fc.constantFrom(...kind.values);
    case 'number':
      return goodNumberText(kind.maxDecimals);
    case 'tileCoordinate':
      return fc.integer({ min: 0, max: 1_000_000 }).map((n) => `${n}${kind.suffix}`);
  }
}

function goodParts(entry: HostEntry): fc.Arbitrary<RequestParts> {
  return fc
    .tuple(
      fc.tuple(...entry.path.map(goodValue)),
      fc.tuple(...entry.query.map((q) => goodValue(q.value))),
    )
    .map(([path, values]) => ({
      scheme: 'https',
      userinfo: null,
      host: entry.host,
      port: null,
      path,
      query:
        entry.query.length === 0
          ? null
          : entry.query.map((q, i): [string, string] => [q.name, values[i] ?? '']),
      fragment: null,
    }));
}

// --- the changes ---------------------------------------------------------------------------------

interface Change {
  readonly name: string;
  readonly apply: (parts: RequestParts, other: string, index: number) => RequestParts;
  readonly hostClass?: string;
}

const CYRILLIC_A = '\u0430';

const CHANGES: readonly Change[] = [
  { name: 'scheme http', apply: (p) => ({ ...p, scheme: 'http' }) },
  { name: 'scheme ftp', apply: (p) => ({ ...p, scheme: 'ftp' }) },
  { name: 'scheme HTTPS', apply: (p) => ({ ...p, scheme: 'HTTPS' }) },
  { name: 'userinfo user', apply: (p) => ({ ...p, userinfo: 'user' }) },
  { name: 'userinfo user:pw', apply: (p) => ({ ...p, userinfo: 'user:pw' }) },
  { name: 'userinfo empty', apply: (p) => ({ ...p, userinfo: '' }) },
  {
    name: 'host prefix label',
    hostClass: 'prefix label',
    apply: (p) => ({ ...p, host: `evil.${p.host}` }),
  },
  {
    name: 'host suffix label',
    hostClass: 'suffix label',
    apply: (p) => ({ ...p, host: `${p.host}.evil.test` }),
  },
  {
    name: 'host trailing dot',
    hostClass: 'trailing dot',
    apply: (p) => ({ ...p, host: `${p.host}.` }),
  },
  {
    name: 'host upper case',
    hostClass: 'upper case',
    apply: (p) => ({ ...p, host: p.host.toUpperCase() }),
  },
  {
    name: 'host at-sign trick',
    hostClass: 'host@evil.test',
    apply: (p) => ({ ...p, host: `${p.host}@evil.test` }),
  },
  {
    name: 'host IDN look-alike',
    hostClass: 'IDN look-alike',
    apply: (p) => ({ ...p, host: p.host.replace('a', CYRILLIC_A) }),
  },
  {
    name: 'host with a tab',
    hostClass: 'tab inside',
    apply: (p) => ({ ...p, host: `${p.host.slice(0, 3)}\t${p.host.slice(3)}` }),
  },
  {
    name: 'host example.org',
    hostClass: 'other host',
    apply: (p) => ({ ...p, host: 'example.org' }),
  },
  { name: 'host localhost', hostClass: 'other host', apply: (p) => ({ ...p, host: 'localhost' }) },
  {
    name: 'host of another entry',
    hostClass: 'host of another entry',
    apply: (p, other) => ({ ...p, host: other }),
  },
  {
    name: 'host listed plus label',
    hostClass: 'listed host as a label of another',
    apply: (p) => ({ ...p, host: `${p.host}.example.org` }),
  },
  { name: 'port 443', apply: (p) => ({ ...p, port: '443' }) },
  { name: 'port 8443', apply: (p) => ({ ...p, port: '8443' }) },
  { name: 'port empty', apply: (p) => ({ ...p, port: '' }) },
  {
    name: 'path segment removed',
    apply: (p, _o, i) => ({
      ...p,
      path: p.path.filter((_, k) => k !== i % Math.max(1, p.path.length)),
    }),
  },
  { name: 'path segment added', apply: (p) => ({ ...p, path: [...p.path, 'extra'] }) },
  { name: 'path trailing slash', apply: (p) => ({ ...p, path: [...p.path, ''] }) },
  ...(['.', '..', '', '%76%31', 'a b'] as const).map((text): Change => ({
    name: `path segment replaced by ${JSON.stringify(text)}`,
    apply: (p, _o, i) => replaceSegment(p, i, () => text),
  })),
  {
    name: 'path segment upper case',
    apply: (p, _o, i) => replaceSegment(p, i, (s) => s.toUpperCase().concat('Q')),
  },
  {
    name: 'path segment longer',
    apply: (p, _o, i) => replaceSegment(p, i, (s) => `${s}0`),
  },
  { name: 'query absent', apply: (p) => ({ ...p, query: null }) },
  { name: 'query empty', apply: (p) => ({ ...p, query: [] }) },
  {
    name: 'query pair removed',
    apply: (p, _o, i) => {
      const query = p.query;
      if (query === null) return p;
      return { ...p, query: query.filter((_, k) => k !== i % Math.max(1, query.length)) };
    },
  },
  {
    name: 'query pair repeated',
    apply: (p, _o, i) => {
      const pair = p.query?.[i % Math.max(1, p.query.length)];
      return { ...p, query: pair === undefined ? p.query : [...(p.query ?? []), pair] };
    },
  },
  {
    name: 'query pair added',
    apply: (p) => ({ ...p, query: [...(p.query ?? []), ['extra', '1'] as const] }),
  },
  ...(['', 'x', '%31', '1e5', '1.23', '+1', ' 1', '1,5', 'NaN'] as const).map((text): Change => ({
    name: `query value replaced by ${JSON.stringify(text)}`,
    apply: (p, _o, i) => {
      const query = p.query;
      if (query === null) return p;
      return {
        ...p,
        query: query.map((pair, k) =>
          k === i % Math.max(1, query.length) ? ([pair[0], text] as const) : pair,
        ),
      };
    },
  })),
  {
    name: 'query reordered (still valid)',
    apply: (p) => ({ ...p, query: p.query === null ? null : [...p.query].reverse() }),
  },
  { name: 'fragment empty', apply: (p) => ({ ...p, fragment: '' }) },
  { name: 'fragment x', apply: (p) => ({ ...p, fragment: 'x' }) },
];

function replaceSegment(
  parts: RequestParts,
  index: number,
  change: (segment: string) => string,
): RequestParts {
  if (parts.path.length === 0) return parts;
  const at = index % parts.path.length;
  return { ...parts, path: parts.path.map((s, k) => (k === at ? change(s) : s)) };
}

/** The names of the changes, for a report of what the generator can draw. */
export const CHANGE_NAMES: readonly string[] = CHANGES.map((c) => c.name);

/**
 * A request from one entry of `hostList`, changed 0 to 3 times (domain above). One draw in four is
 * not changed at all, so that accepted requests are common.
 */
export function hostileRequest(hostList: HostList): fc.Arbitrary<HostileRequest> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: Math.max(0, hostList.length - 1) }),
      fc.integer({ min: 0, max: 8 }),
      fc.array(fc.tuple(fc.integer({ min: 0, max: CHANGES.length - 1 }), fc.nat(7)), {
        maxLength: 3,
      }),
    )
    .chain(([entryIndex, quarter, picks]) => {
      const entry = hostList[entryIndex];
      if (entry === undefined) throw new Error('hostileRequest needs a non-empty Host list');
      const another = hostList.find((e) => e.host !== entry.host)?.host ?? 'example.net';
      return goodParts(entry).map((start): HostileRequest => {
        const chosen = quarter < 2 ? [] : picks;
        let parts = start;
        const changes: string[] = [];
        let hostClass: string | null = null;
        for (const [changeIndex, at] of chosen) {
          const change = CHANGES[changeIndex];
          if (change === undefined) continue;
          parts = change.apply(parts, another, at);
          changes.push(change.name);
          if (change.hostClass !== undefined) hostClass = change.hostClass;
        }
        return { url: urlOf(parts), parts, entry, changes, hostClass };
      });
    });
}
