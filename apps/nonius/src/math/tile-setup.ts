// The tile source from the build environment (Req 9.6): four values from the build, the tile URL
// template, its attribution, the Source's name and the address of its terms. With any of the four
// missing there is no tile source and no failure (the plain background, no request). A template or
// a terms address that is not an https address of a named host is `invalid_number` naming the
// field, as UI's `checkTileSource` does. A pure function of text: `main.tsx` reads the environment.

import { err, ok, type NoniusResult } from '../result';

export interface TileEnvironment {
  readonly urlTemplate?: string | undefined;
  readonly attribution?: string | undefined;
  readonly sourceName?: string | undefined;
  readonly termsUrl?: string | undefined;
}

export interface TileSetup {
  readonly tileUrlTemplates: readonly string[];
  readonly attribution: string;
  readonly sourceName: string;
  readonly termsUrl: string;
}

const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const TERMS_URL = /^https:\/\/[^\s/?#]+\S*$/;
const HTTPS_PREFIX = 'https://';

function hostIsNamed(template: string): boolean {
  if (!template.startsWith(HTTPS_PREFIX)) return false;
  const rest = template.slice(HTTPS_PREFIX.length);
  const end = rest.search(/[/?#]/);
  return HOST_NAME.test(end < 0 ? rest : rest.slice(0, end));
}

export function tileSetupFromEnvironment(
  environment: TileEnvironment,
): NoniusResult<TileSetup | null> {
  const templates = (environment.urlTemplate ?? '').split(/\s+/).filter((t) => t !== '');
  const attribution = (environment.attribution ?? '').trim();
  const sourceName = (environment.sourceName ?? '').trim();
  const termsUrl = (environment.termsUrl ?? '').trim();
  if (templates.length === 0 || attribution === '' || sourceName === '' || termsUrl === '') {
    return ok(null);
  }
  if (!TERMS_URL.test(termsUrl)) return err('invalid_number', { field: 'termsUrl' });
  if (!templates.every(hostIsNamed)) return err('invalid_number', { field: 'urlTemplate' });
  return ok({ tileUrlTemplates: templates, attribution, sourceName, termsUrl });
}
