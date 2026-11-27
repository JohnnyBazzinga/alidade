// The Sighting QR (Req 10.5, 10.6, design D13): an inline SVG drawn from the encoder's matrix,
// black on white, with a quiet zone of four modules, as wide as the screen allows, and the link
// as text beside it for a phone whose camera does not read QR codes. No image element, no canvas,
// no remote source. The brightness of the screen is left to the user.

import { activeTheme, ROLE_VARS } from '@alidade/ui';
import { useMemo } from 'react';
import type { QrMatrix } from '../adapters/qr-encoder';
import { LOOK } from './look';

/** The quiet zone of the QR standard: four modules on each side. */
export const QUIET_ZONE_MODULES = 4;

// Black on white in every theme: `qrDark` and `qrLight` are roles that no theme changes (skeleton-ui
// Req 22.2), so their resolved values may stand in the SVG's attributes and need no redraw.
const DARK = activeTheme().colours.qrDark;
const LIGHT = activeTheme().colours.qrLight;

export function QrImage({ matrix, link }: { readonly matrix: QrMatrix; readonly link: string }) {
  const side = matrix.size + 2 * QUIET_ZONE_MODULES;
  const path = useMemo(() => {
    let d = '';
    matrix.modules.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h1v1h-1z`;
      });
    });
    return d;
  }, [matrix]);
  return (
    <figure style={{ ...LOOK.stack, margin: 0 }}>
      <svg
        role="img"
        aria-label="QR code of the sighting link"
        viewBox={`0 0 ${side} ${side}`}
        shapeRendering="crispEdges"
        // As large as the width allows, and no taller than what the screen leaves under the view's
        // other rows (Back, the title, one line, the link), so that it is inside the first screen.
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: 'calc(100dvh - 330px)',
          display: 'block',
          background: LIGHT,
        }}
      >
        <rect x={0} y={0} width={side} height={side} fill={LIGHT} />
        <path d={path} fill={DARK} />
      </svg>
      <figcaption
        data-testid="qr-link"
        style={{ ...LOOK.readout, fontSize: 12, lineHeight: 1.5, color: ROLE_VARS.infoInk }}
      >
        {link}
      </figcaption>
    </figure>
  );
}
