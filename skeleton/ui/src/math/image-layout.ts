// The Image layout (Req 5.1, design §7.4): how a Source image sits in an Element under an Image
// fit, always preserving its aspect ratio and centred.

import { err, ok, type UiResult } from '../result';

export type ImageFit = 'cover' | 'contain';

/** A size in source pixels (the image the camera delivers, upright in portrait). */
export interface SourceSize {
  readonly widthSourcePx: number;
  readonly heightSourcePx: number;
}

/** A size in CSS pixels. */
export interface PixelSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** A point in CSS pixels from the top left corner of the Element, `yPx` growing downward. */
export interface PixelPoint {
  readonly xPx: number;
  readonly yPx: number;
}

export interface ImageLayout {
  readonly fit: ImageFit;
  readonly sourceWidthSourcePx: number;
  readonly sourceHeightSourcePx: number;
  readonly elementWidthPx: number;
  readonly elementHeightPx: number;
  readonly scalePxPerSourcePx: number;
  readonly displayedWidthPx: number;
  readonly displayedHeightPx: number;
  readonly leftPx: number;
  readonly topPx: number;
}

function positive(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

/**
 * `cover`: scale `max(ew / sw, eh / sh)`; `contain`: `min(...)`; displayed size `(sw·s, sh·s)`,
 * centred. A size that is `NaN`, infinite or not positive (or a scale or displayed size that
 * overflows) is `invalid_number` naming it.
 */
export function imageLayout(
  source: SourceSize,
  element: PixelSize,
  fit: ImageFit,
): UiResult<ImageLayout> {
  const sw = source.widthSourcePx;
  const sh = source.heightSourcePx;
  const ew = element.widthPx;
  const eh = element.heightPx;
  if (!positive(sw)) return err('invalid_number', { field: 'sourceWidthSourcePx' });
  if (!positive(sh)) return err('invalid_number', { field: 'sourceHeightSourcePx' });
  if (!positive(ew)) return err('invalid_number', { field: 'elementWidthPx' });
  if (!positive(eh)) return err('invalid_number', { field: 'elementHeightPx' });
  if (fit !== 'cover' && fit !== 'contain') return err('invalid_number', { field: 'fit' });
  const scale = fit === 'cover' ? Math.max(ew / sw, eh / sh) : Math.min(ew / sw, eh / sh);
  if (!positive(scale)) return err('invalid_number', { field: 'scalePxPerSourcePx' });
  const dw = sw * scale;
  const dh = sh * scale;
  if (!positive(dw)) return err('invalid_number', { field: 'displayedWidthPx' });
  if (!positive(dh)) return err('invalid_number', { field: 'displayedHeightPx' });
  return ok({
    fit,
    sourceWidthSourcePx: sw,
    sourceHeightSourcePx: sh,
    elementWidthPx: ew,
    elementHeightPx: eh,
    scalePxPerSourcePx: scale,
    displayedWidthPx: dw,
    displayedHeightPx: dh,
    leftPx: (ew - dw) / 2,
    topPx: (eh - dh) / 2,
  });
}
