// The Reticle (Req 13.1): drawn at the centre of the Element, which is the Camera axis (Req 5.9),
// as two tones: a light core line over a dark outline on each side, with a clear gap at the
// centre so that the target is not hidden. Each arm is an outline bar with the core bar inside it.

import type { CSSProperties } from 'react';
import { COLOURS, SIZES } from './theme';

type Side = 'left' | 'right' | 'top' | 'bottom';
const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];

/** The side length of the square that holds the four arms. */
const EXTENT_PX = 2 * (SIZES.reticleGapPx / 2 + SIZES.reticleArmPx);

function armStyle(side: Side, thicknessPx: number, insetPx: number): CSSProperties {
  const horizontal = side === 'left' || side === 'right';
  const lengthPx = SIZES.reticleArmPx - 2 * insetPx;
  const centrePx = EXTENT_PX / 2;
  const alongPx =
    side === 'left' || side === 'top'
      ? centrePx - SIZES.reticleGapPx / 2 - SIZES.reticleArmPx + insetPx
      : centrePx + SIZES.reticleGapPx / 2 + insetPx;
  const acrossPx = centrePx - thicknessPx / 2;
  return {
    position: 'absolute',
    width: horizontal ? lengthPx : thicknessPx,
    height: horizontal ? thicknessPx : lengthPx,
    left: horizontal ? alongPx : acrossPx,
    top: horizontal ? acrossPx : alongPx,
  };
}

export function Reticle() {
  const outlineThicknessPx = SIZES.reticleCorePx + 2 * SIZES.reticleOutlinePx;
  return (
    <div
      data-testid="reticle"
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: EXTENT_PX,
        height: EXTENT_PX,
        marginLeft: -EXTENT_PX / 2,
        marginTop: -EXTENT_PX / 2,
        pointerEvents: 'none',
      }}
    >
      {SIDES.map((side) => (
        <div key={side}>
          <div
            data-part="outline"
            data-side={side}
            style={{ ...armStyle(side, outlineThicknessPx, 0), background: COLOURS.outline }}
          />
          <div
            data-part="core"
            data-side={side}
            style={{
              ...armStyle(side, SIZES.reticleCorePx, SIZES.reticleOutlinePx),
              background: COLOURS.brass,
            }}
          />
        </div>
      ))}
    </div>
  );
}
