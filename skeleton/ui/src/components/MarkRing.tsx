// The Mark (Req 13.3): a ring at the Pixel point that Req 5.3 gives for its Ray offset, drawn
// again from the offset whenever the layout changes, with the Reticle's two-tone construction.

import { rayOffsetToPoint } from '../math/image-geometry';
import type { ImageLayout } from '../math/image-layout';
import type { Mark } from '../math/session/session';
import { COLOURS, SIZES } from './theme';

/** As Req 5.4: a point within this of the Element's edge is on it. */
const EDGE_TOLERANCE_PX = 1e-9;

export interface MarkRingProps {
  readonly mark: Mark;
  readonly layout: ImageLayout;
}

export function MarkRing({ mark, layout }: MarkRingProps) {
  const placed = rayOffsetToPoint(layout, mark.calibration, mark.offset);
  if (!placed.ok) return null;
  const { point } = placed.value;
  // The tolerance with which a tapped point on the edge was accepted (Req 5.4): a Mark the
  // Session holds is drawn even when its round trip lands a few ulps outside the Element.
  const inside =
    point.xPx >= -EDGE_TOLERANCE_PX &&
    point.xPx <= layout.elementWidthPx + EDGE_TOLERANCE_PX &&
    point.yPx >= -EDGE_TOLERANCE_PX &&
    point.yPx <= layout.elementHeightPx + EDGE_TOLERANCE_PX;
  if (!inside) return null;
  const outerPx = SIZES.markRingPx;
  const innerPx = outerPx - 2 * SIZES.markRingOutlinePx;
  return (
    <div
      data-testid="mark-ring"
      aria-label="Mark"
      style={{
        position: 'absolute',
        left: point.xPx - outerPx / 2,
        top: point.yPx - outerPx / 2,
        width: outerPx,
        height: outerPx,
        boxSizing: 'border-box',
        borderRadius: '50%',
        border: `${SIZES.markRingOutlinePx}px solid ${COLOURS.outline}`,
        pointerEvents: 'none',
      }}
    >
      <div
        data-part="core"
        style={{
          width: innerPx,
          height: innerPx,
          boxSizing: 'border-box',
          borderRadius: '50%',
          border: `${SIZES.markRingCorePx}px solid ${COLOURS.brass}`,
          outline: `${SIZES.markRingOutlinePx}px solid ${COLOURS.outline}`,
          outlineOffset: -SIZES.markRingCorePx - SIZES.markRingOutlinePx,
        }}
      />
    </div>
  );
}
