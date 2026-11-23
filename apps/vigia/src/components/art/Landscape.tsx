// The header's landscape (Req 22.2, design D25.4): ridges, a tree line and, in the full header, a
// small fire with its plume on the far ridge. Its last ridge is filled with the page's `bg`, so that
// the header ends in the page with nothing lying over anything. Decorative: hidden from assistive
// technology; every paint is a role (or the plume's grey) in `style`.

import { ROLE_VARS } from '@alidade/ui';
import { ART_COLOURS } from './art-colours';

/** The strip's height in each header (D25.4). */
export const LANDSCAPE_HEIGHT_PX = { full: 22, compact: 10 } as const;

/** A tree line of small triangles between `x0` and `x1`, standing on the line `y`. */
function trees(x0: number, x1: number, y: number, step: number): string {
  let d = '';
  for (let x = x0; x < x1; x += step) {
    const h = 5 + ((x * 7) % 4);
    d += `M${x} ${y}l${step / 2} -${h}l${step / 2} ${h}z`;
  }
  return d;
}

export function Landscape({ variant }: { readonly variant: 'full' | 'compact' }) {
  const heightPx = LANDSCAPE_HEIGHT_PX[variant];
  if (variant === 'compact') {
    return (
      <svg
        data-art="landscape"
        aria-hidden="true"
        focusable="false"
        width="100%"
        height={heightPx}
        viewBox="0 0 400 10"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <path
          d="M0 6 L50 3 L110 6 L170 2 L240 6 L300 3 L360 6 L400 4 V10 H0 Z"
          style={{ fill: ROLE_VARS.headerDim, opacity: 0.25 }}
        />
        <path
          data-art="last-ridge"
          d="M0 8 Q100 5 200 8 T400 7 V10 H0 Z"
          style={{ fill: ROLE_VARS.bg }}
        />
      </svg>
    );
  }
  return (
    <svg
      data-art="landscape"
      aria-hidden="true"
      focusable="false"
      width="100%"
      height={heightPx}
      viewBox="0 0 400 22"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <path
        d="M0 11 L40 6 L85 10 L130 3 L180 9 L230 4 L285 10 L335 5 L400 9 V22 H0 Z"
        style={{ fill: ROLE_VARS.headerDim, opacity: 0.28 }}
      />
      {/* The fire on the far ridge and its plume, leaning with the wind. */}
      <g data-art="plume">
        <ellipse
          cx="338"
          cy="2.5"
          rx="16"
          ry="2.5"
          style={{ fill: ART_COLOURS.plumeLight, opacity: 0.55 }}
        />
        <ellipse
          cx="331"
          cy="4.5"
          rx="9"
          ry="2.4"
          style={{ fill: ART_COLOURS.plumeLight, opacity: 0.8 }}
        />
        <ellipse cx="327" cy="6.2" rx="5" ry="2" style={{ fill: ART_COLOURS.plumeDark }} />
        <path d="M322 10 l3 -4 l1.5 2.5 l1.5 -3 l3 4.5 z" style={{ fill: ROLE_VARS.warnBar }} />
        <path d="M324.5 10 l2 -2.5 l2 2.5 z" style={{ fill: ROLE_VARS.primary }} />
      </g>
      <path
        d="M0 15 L55 10 L105 14 L160 9 L225 15 L280 10 L345 14 L400 11 V22 H0 Z"
        style={{ fill: ROLE_VARS.tabBar, opacity: 0.55 }}
      />
      <path d={trees(0, 400, 17, 9)} style={{ fill: ROLE_VARS.tabBar, opacity: 0.7 }} />
      <path
        data-art="last-ridge"
        d="M0 19 Q100 14 200 19 T400 17 V22 H0 Z"
        style={{ fill: ROLE_VARS.bg }}
      />
    </svg>
  );
}
