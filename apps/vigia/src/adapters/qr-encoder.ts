// The QR encoder adapter (Req 10.5, 10.6, 20.4, design §3.2, D13): the one module that imports the
// QR package (`uqr` 0.1.3). A link goes in; a square matrix of dark and light modules comes out,
// which the component draws as an inline SVG with its own quiet zone and colours. Error
// correction is level M, with no border (the quiet zone is the component's), and the package
// chooses the smallest version that holds the link (byte mode: a link has lower-case letters).
// There is no decoder here and no scanner (Req 10.5).

import { encode as uqrEncode } from 'uqr';
import { checkParameters, type VigiaParameters } from '../math/parameters';
import { err, ok, type VigiaResult } from '../result';

export interface QrMatrix {
  readonly size: number;
  readonly version: number;
  /** `modules[row][column]` is true for a dark module. */
  readonly modules: readonly (readonly boolean[])[];
}

export interface VigiaQr {
  /** `link_too_long` over `maxLinkLengthChars`; `invalid_number` for an empty link or a bad result. */
  qrMatrix(link: string): VigiaResult<QrMatrix>;
}

/** The part of the package this adapter uses (`uqr`'s `encode`), so that a test can pass a fake. */
export type QrEncode = (
  text: string,
  options: { readonly ecc: 'M'; readonly border: 0 },
) => {
  readonly version: number;
  readonly size: number;
  readonly data: readonly (readonly boolean[])[];
};

function errorNameOf(error: unknown): string | undefined {
  const name: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
  return typeof name === 'string' && name !== '' ? name : undefined;
}

export function createQrEncoder(
  parameters: VigiaParameters,
  encode: QrEncode = uqrEncode,
): VigiaResult<VigiaQr> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  return ok({
    qrMatrix(link) {
      if (link.length === 0) return err('invalid_number', { field: 'link' });
      if (link.length > parameters.maxLinkLengthChars) return err('link_too_long');
      let encoded: ReturnType<QrEncode>;
      try {
        encoded = encode(link, { ecc: 'M', border: 0 });
      } catch (error) {
        const errorName = errorNameOf(error);
        return err('invalid_number', {
          field: 'link',
          ...(errorName === undefined ? {} : { errorName }),
        });
      }
      const { version, size, data } = encoded;
      const square = data.length === size && data.every((row) => row.length === size) && size > 0;
      if (!Number.isInteger(version) || size !== 4 * version + 17 || !square) {
        return err('invalid_number', { field: 'qr' });
      }
      return ok({ size, version, modules: data.map((row) => [...row]) });
    },
  });
}
