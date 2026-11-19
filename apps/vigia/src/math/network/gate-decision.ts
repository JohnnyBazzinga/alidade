// The decision of the Network gate (Req 11.3, 11.9, design D14, §7.14 steps 1 to 6): a pure
// function of a URL string and the Host list. The platform's `URL` parser reads the string, and the
// string is then required to equal what the parser writes, so that case, a written-out default
// port, a dot segment or a percent-encoding variant is refused and never normalised into a listed
// request.

import { err, ok, type VigiaResult } from '../../result';
import type { HostEntry, HostList, ValueKind } from './host-list';

const refuse = (field: string) => err('host_not_allowed', { field });

/** A number of the grid kind: `-` optional, digits, at most `maxDecimals` after one point. */
function numberPattern(maxDecimals: number): RegExp {
  return maxDecimals >= 1 ? new RegExp(`^-?\\d+(?:\\.\\d{1,${maxDecimals}})?$`) : /^-?\d+$/;
}

function valueMatches(kind: ValueKind, text: string): boolean {
  switch (kind.kind) {
    case 'literal':
      return text === kind.value;
    case 'oneOf':
      return kind.values.includes(text);
    case 'number':
      return numberPattern(kind.maxDecimals).test(text);
    case 'tileCoordinate':
      return (
        text.endsWith(kind.suffix) && /^\d+$/.test(text.slice(0, text.length - kind.suffix.length))
      );
  }
}

/** The step that refuses `entry`, or `null` when the path and the raw query are the entry's. */
function entryRefusal(
  entry: HostEntry,
  pathname: string,
  queryText: string | null,
): 'path' | 'query' | null {
  const segments = pathname.slice(1).split('/');
  if (segments.length !== entry.path.length) return 'path';
  for (let i = 0; i < entry.path.length; i += 1) {
    const kind = entry.path[i];
    const segment = segments[i];
    if (kind === undefined || segment === undefined || !valueMatches(kind, segment)) return 'path';
  }
  if (entry.query.length === 0) return queryText === null ? null : 'query';
  if (queryText === null) return 'query';
  const pairs = queryText.split('&');
  if (pairs.length !== entry.query.length) return 'query';
  const found = new Map<string, string>();
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1) return 'query';
    const name = pair.slice(0, at);
    if (found.has(name)) return 'query';
    found.set(name, pair.slice(at + 1));
  }
  for (const wanted of entry.query) {
    const value = found.get(wanted.name);
    if (value === undefined || !valueMatches(wanted.value, value)) return 'query';
  }
  return null;
}

/**
 * Decides whether a request to `url` is one the Host list allows. Refuses with `host_not_allowed`
 * and `field` naming the step: `url` (does not parse), `canonical` (not what the parser writes),
 * `scheme`, `userinfo`, `port`, `fragment`, `host`, `path`, `query`. Returns the entry, so that the
 * gate knows which Source the request is for.
 */
export function decideRequest(url: string, hostList: HostList): VigiaResult<HostEntry> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return refuse('url');
  }
  if (parsed.href !== url) return refuse('canonical');
  if (parsed.protocol !== 'https:') return refuse('scheme');
  if (parsed.username !== '' || parsed.password !== '') return refuse('userinfo');
  if (parsed.port !== '') return refuse('port');
  // `hash` is empty for a bare `#` too, so the text is what is looked at.
  if (url.includes('#')) return refuse('fragment');
  const candidates = hostList.filter((entry) => entry.host === parsed.hostname);
  if (candidates.length === 0) return refuse('host');
  // The raw text after `?`: a bare `?` is a query of one empty pair, never "no query".
  const queryAt = url.indexOf('?');
  const queryText = queryAt < 0 ? null : url.slice(queryAt + 1);
  let firstRefusal: 'path' | 'query' = 'path';
  for (const [index, entry] of candidates.entries()) {
    const refusal = entryRefusal(entry, parsed.pathname, queryText);
    if (refusal === null) return ok(entry);
    if (index === 0) firstRefusal = refusal;
  }
  return refuse(firstRefusal);
}
