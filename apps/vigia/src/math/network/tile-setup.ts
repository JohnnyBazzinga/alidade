// The tile source from the build environment (Req 11.4, 18.6; the lead's decision of 2026-11-21).
// The repository names no tile provider: the page's build gives four values, the tile URL
// template, its attribution, the Source's name and the address of its terms. With all four
// present, the provider is built from them, its host being the template's, and the Host list is
// built with it, so that the gate's decision lets that host's tiles through and nothing else.
// With any of the four missing there is no tile source and no failure (the plain background,
// Req 11.8). A template that is not valid is `host_not_allowed`, as for any host not listed.
// A pure function of text: it reads no environment itself (`main.tsx` does).

import { err, ok, type VigiaResult } from '../../result';
import { buildHostList, type HostList, type TileProvider } from './host-list';

/** The four values of the build environment, each possibly missing or empty. */
export interface TileEnvironment {
  /** One or more templates with `{z}`, `{x}` and `{y}`, separated by white space. */
  readonly urlTemplate?: string | undefined;
  readonly attribution?: string | undefined;
  readonly sourceName?: string | undefined;
  readonly termsUrl?: string | undefined;
}

export interface TileSetup {
  /** The wind entry and one tiles entry for each template. */
  readonly hostList: HostList;
  readonly tileUrlTemplates: readonly string[];
  readonly attribution: string;
  readonly sourceName: string;
  readonly termsUrl: string;
}

const TERMS_URL = /^https:\/\/[^\s/?#]+\S*$/;
/** A host name as the URL parser writes it: lower case labels, at least one dot. */
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const HTTPS_PREFIX = 'https://';

/** The host a template names, or `''` when it names none (the Host list then refuses it). */
function hostOfTemplate(template: string): string {
  if (!template.startsWith(HTTPS_PREFIX)) return '';
  const rest = template.slice(HTTPS_PREFIX.length);
  const end = rest.search(/[/?#]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  return HOST_NAME.test(authority) ? authority : '';
}

/**
 * `null` when any of the four values is missing or only white space; the setup when all are
 * present and valid; `host_not_allowed` (naming `termsUrl`, `scheme`, `host` or `template`) when
 * they are present and not valid.
 */
export function tileSetupFromEnvironment(
  environment: TileEnvironment,
): VigiaResult<TileSetup | null> {
  const templates = (environment.urlTemplate ?? '').split(/\s+/).filter((t) => t !== '');
  const attribution = (environment.attribution ?? '').trim();
  const sourceName = (environment.sourceName ?? '').trim();
  const termsUrl = (environment.termsUrl ?? '').trim();
  if (templates.length === 0 || attribution === '' || sourceName === '' || termsUrl === '') {
    return ok(null);
  }
  if (!TERMS_URL.test(termsUrl)) return err('host_not_allowed', { field: 'termsUrl' });

  const hosts = [...new Set(templates.map(hostOfTemplate).filter((h) => h !== ''))];
  const providers: readonly TileProvider[] = hosts.map((host) => ({
    host,
    sourceName,
    termsUrl,
    attribution,
  }));
  const hostList = buildHostList(templates, providers);
  if (!hostList.ok) return hostList;
  return ok({
    hostList: hostList.value,
    tileUrlTemplates: templates,
    attribution,
    sourceName,
    termsUrl,
  });
}
