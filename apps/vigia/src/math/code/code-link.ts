// The Sighting link, and the code read back from a message (Req 10.2 to 10.4, 10.9, design §7.13).
//
// The link is built by string operations on the page's own address, with no `URL` object, so that
// no normalisation can move the code into the path. The code is only in the fragment, after `#`:
// a fragment is not sent in a request, so no server that serves or logs the page receives it
// (Req 15.3).

import { err, ok, type VigiaResult } from '../../result';
import { checkParameters, type VigiaParameters } from '../parameters';
import { ALPHABET, isAlphabetString, stripCode, symbolValue } from './alphabet';
import { CODE_LENGTH, VERSION_SYMBOL } from './sighting-code';

/** `https://` and a host, or `http://` and `localhost` or `127.0.0.1` (a developer's page). */
const PAGE_ADDRESS = /^(?:https:\/\/[^\s/?#]|http:\/\/(?:localhost|127\.0\.0\.1)(?=[:/?#]|$))/;
const NO_WHITESPACE = /^\S*$/;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);
/** The first link of a message that carries a code: an address of http or https, up to the `#`. */
const LINK_WITH_FRAGMENT = /https?:\/\/[^\s#]*#/i;

/**
 * The page address without its query and fragment, `#`, and the code (Req 10.2). The code must be
 * 50 symbols of the alphabet (else `invalid_number`, `field: 'code'`); the address must begin
 * `https://` and a host, or be `http://` on `localhost` or `127.0.0.1` (else `invalid_number`,
 * `field: 'pageAddress'`) and hold no whitespace. A link longer than `maxLinkLengthChars` is
 * `link_too_long`: the text code is still offered.
 */
export function buildSightingLink(
  pageAddress: string,
  code: string,
  parameters: VigiaParameters,
): VigiaResult<string> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!PAGE_ADDRESS.test(pageAddress) || !NO_WHITESPACE.test(pageAddress)) {
    return err('invalid_number', { field: 'pageAddress' });
  }
  if (!CODE_PATTERN.test(code)) return err('invalid_number', { field: 'code' });
  const cut = pageAddress.search(/[?#]/);
  const base = cut < 0 ? pageAddress : pageAddress.slice(0, cut);
  const link = `${base}#${code}`;
  if (link.length > parameters.maxLinkLengthChars) return err('link_too_long');
  return ok(link);
}

/**
 * The code in what the user pasted: a code, a link, or a message with a link in it (Req 10.4).
 *
 * With a link (the first of the message), the text after its `#` is read symbol by symbol, skipping
 * whitespace and hyphens: it stops at any other character, after 50 symbols when the first is the
 * symbol of version 1 (so that capitals after the link are not read into the code), or after
 * `maxCodeLengthChars` symbols; nothing read is `code_not_a_sighting`. With no link, the text
 * without whitespace and hyphens is the code if it is made of symbols and not empty, else
 * `code_not_a_sighting`. The text read is not checked here: `decodeSighting` judges it.
 */
export function extractSightingCode(
  pasted: string,
  parameters: VigiaParameters,
): VigiaResult<string> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  const link = LINK_WITH_FRAGMENT.exec(pasted);
  if (link === null) {
    const bare = stripCode(pasted);
    if (bare.length === 0 || !isAlphabetString(bare)) return err('code_not_a_sighting');
    return ok(bare);
  }
  let code = '';
  for (const character of pasted.slice(link.index + link[0].length)) {
    if (/[\s-]/.test(character)) continue;
    if (symbolValue(character) === null) break;
    code += character;
    if (code.length >= parameters.maxCodeLengthChars) break;
    if (code.length === CODE_LENGTH && code.startsWith(VERSION_SYMBOL)) break;
  }
  return code.length === 0 ? err('code_not_a_sighting') : ok(code);
}
