// The picture in the camera's place before Start (Req 22.8, skeleton-ui Req 22.15; design D25.4):
// the header's landscape, larger: the sky, the ridges, a tree line and a column of smoke rising
// from a small fire on the far ridge, the thing the user is about to sight. Decorative: hidden from
// assistive technology, no text; every paint is a role (or the plume's grey) in `style`.

import { ROLE_VARS } from '@alidade/ui';
import { ART_COLOURS } from './art-colours';

function trees(x0: number, x1: number, y: number, step: number): string {
  let d = '';
  for (let x = x0; x < x1; x += step) {
    const h = 12 + ((x * 7) % 9);
    d += `M${x} ${y}l${step / 2} -${h}l${step / 2} ${h}z`;
  }
  return d;
}

export function IdleScene() {
  return (
    <svg
      data-art="idle-scene"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width="400" height="240" style={{ fill: ROLE_VARS.header }} />
      <path
        d="M0 120 L50 98 L110 116 L170 84 L230 110 L280 92 L340 112 L400 96 V240 H0 Z"
        style={{ fill: ROLE_VARS.headerDim, opacity: 0.25 }}
      />
      <g data-art="plume">
        <ellipse
          cx="300"
          cy="34"
          rx="58"
          ry="20"
          style={{ fill: ART_COLOURS.plumeLight, opacity: 0.45 }}
        />
        <ellipse
          cx="282"
          cy="54"
          rx="40"
          ry="17"
          style={{ fill: ART_COLOURS.plumeLight, opacity: 0.7 }}
        />
        <ellipse cx="268" cy="72" rx="26" ry="14" style={{ fill: ART_COLOURS.plumeLight }} />
        <ellipse cx="259" cy="88" rx="15" ry="10" style={{ fill: ART_COLOURS.plumeDark }} />
        <path d="M247 108 l7 -12 l5 6 l5 -10 l8 16 z" style={{ fill: ROLE_VARS.warnBar }} />
        <path d="M253 108 l5 -7 l5 7 z" style={{ fill: ROLE_VARS.primary }} />
      </g>
      <path
        d="M0 150 L60 128 L120 146 L190 122 L260 150 L320 130 L400 146 V240 H0 Z"
        style={{ fill: ROLE_VARS.tabBar, opacity: 0.6 }}
      />
      <path d={trees(0, 400, 172, 16)} style={{ fill: ROLE_VARS.tabBar, opacity: 0.8 }} />
      <path d="M0 196 Q100 174 200 192 T400 184 V240 H0 Z" style={{ fill: ROLE_VARS.bg }} />
    </svg>
  );
}
