// P-10.9 (Req 10.2, 10.4, 10.9): the Sighting link is the page's address without its query and
// fragment, `#`, and the code; it holds no part of the code before the `#`; and the code is read
// back from a message that surrounds the link with text and has broken the code up.

import fc from 'fast-check';
import { describe, it } from 'vitest';
import { pageAddress, sightingArb, uniformInteger } from '../../test-support/generators';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { defaultParameters } from '../parameters';
import { buildSightingLink, extractSightingCode } from './code-link';
import { decodeSighting, encodeSighting } from './sighting-code';

const PARAMETERS = defaultParameters();

/**
 * Text that stands around the link. Domain: 0 to 200 arbitrary characters of the full set of
 * `fc.string` (the Basic Multilingual Plane units, spaces, line breaks and control characters
 * included). The text before the link holds no `://`, so no earlier link: a message with two
 * links reads the first, which an example test covers. The text after the link is arbitrary.
 */
const textAround = (): fc.Arbitrary<string> =>
  fc.string({ maxLength: 200, unit: 'binary' }).map((text) => text.slice(0, 200));
const textBefore = (): fc.Arbitrary<string> => textAround().filter((text) => !text.includes('://'));

describe('P-10.9: link, extraction and decoding (Req 10.2, 10.4, 10.9)', () => {
  // Spaces and line feeds are inserted into the code after the `#`: 1 to 6 insertions of a space,
  // a hyphen or a line feed at drawn places, and one line feed at a drawn place.
  const breaks = fc.tuple(
    fc.array(fc.tuple(uniformInteger(1, 49), fc.constantFrom(' ', '-', '\n', '  ')), {
      minLength: 1,
      maxLength: 6,
    }),
    uniformInteger(1, 49),
  );

  it('builds the link from the address, reads the code back through any text and any breaks, and refuses a link that is too long', () => {
    checkProperty(
      'P-10.9',
      fc.property(
        pageAddress(),
        sightingArb(),
        textBefore(),
        textAround(),
        breaks,
        (address, sighting, before, after, [inserts, lineFeedAt]) => {
          const encoded = encodeSighting(sighting);
          if (!encoded.ok) throw new Error('encode failed');
          const code = encoded.value;
          const base = address.split(/[?#]/)[0] ?? '';
          const link = buildSightingLink(address, code, PARAMETERS);
          if (base.length + 1 + code.length > PARAMETERS.maxLinkLengthChars) {
            if (link.ok || link.reason !== 'link_too_long')
              throw new Error(`a link of ${base.length + 51} was not refused`);
            return;
          }
          if (!link.ok) throw new Error(`link failed: ${link.reason}`);
          // The link is the address without its query and fragment, `#` and the code.
          if (link.value !== `${base}#${code}`) throw new Error(`link ${link.value}`);
          // No part of the code before the `#`, and exactly one `#`.
          const hash = link.value.indexOf('#');
          if (link.value.slice(0, hash).includes(code) || link.value.split('#').length !== 2) {
            throw new Error('the code or a second # before the end of the link');
          }
          if (link.value.length > PARAMETERS.maxLinkLengthChars)
            throw new Error('too long and not refused');
          // The message: the link with the code broken up after the `#`, among arbitrary text.
          let shown = code;
          for (const [at, text] of [...inserts, [lineFeedAt, '\n'] as const].sort(
            (a, b) => b[0] - a[0],
          )) {
            shown = shown.slice(0, at) + text + shown.slice(at);
          }
          const message = `${before}${base}#${shown}${after}`;
          const extracted = extractSightingCode(message, PARAMETERS);
          if (!extracted.ok)
            throw new Error(`extract failed: ${extracted.reason}\n${JSON.stringify(message)}`);
          const decoded = decodeSighting(extracted.value, PARAMETERS);
          const expected = decodeSighting(code, PARAMETERS);
          if (!decoded.ok || !expected.ok) throw new Error('decode failed');
          if (JSON.stringify(decoded.value) !== JSON.stringify(expected.value))
            throw new Error('another Sighting');
        },
      ),
      new ErrorTracker(),
      { numRuns: cappedRuns(10_000) },
    );
  });
});
