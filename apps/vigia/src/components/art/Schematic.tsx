// The schematic of "Where to sight from next" (Req 22.12, design D25.4): two pins, where you stood
// and where to go next, on a baseline at a right angle to the line of sight, marked "At least 1/3
// of the distance", and the line of sight from the first pin to the smoke. Not to scale and with no
// number as a place: its name says so, and so does the visible line under it.

import { BODY_FONT_STACK, ROLE_VARS } from '@alidade/ui';
import { SCHEMATIC_TEXT } from '../../math/texts';
import { ART_COLOURS } from './art-colours';

/** A map pin whose point is at (x, y). */
function pin(x: number, y: number): string {
  return `M${x} ${y} C${x - 3} ${y - 7} ${x - 9} ${y - 11} ${x - 9} ${y - 17} a9 9 0 0 1 18 0 C${x + 9} ${y - 11} ${x + 3} ${y - 7} ${x} ${y} z`;
}

const label = {
  fontFamily: BODY_FONT_STACK,
  fontSize: 16,
  fill: ROLE_VARS.ink,
} as const;

export function Schematic() {
  const a = { x: 60, y: 152 };
  const b = { x: 246, y: 152 };
  const smoke = { x: 60, y: 34 };
  return (
    <figure
      data-testid="schematic"
      style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <svg
        role="img"
        aria-label={SCHEMATIC_TEXT.label}
        viewBox="0 0 300 196"
        width="100%"
        style={{ display: 'block', height: 'auto' }}
      >
        {/* The line of sight, from where you stood to the smoke. */}
        <line
          data-art="line-of-sight"
          x1={a.x}
          y1={a.y - 20}
          x2={smoke.x}
          y2={smoke.y + 14}
          style={{ stroke: ROLE_VARS.accent, strokeWidth: 2.5 }}
        />
        <path
          d={`M${smoke.x - 6} ${smoke.y + 24} l6 -10 l6 10`}
          style={{ fill: 'none', stroke: ROLE_VARS.accent, strokeWidth: 2.5 }}
        />
        <text x={a.x + 12} y={96} style={label}>
          {SCHEMATIC_TEXT.sight}
        </text>
        {/* The smoke: a small fire and its plume. */}
        <g data-art="smoke">
          <ellipse
            cx={smoke.x + 14}
            cy={smoke.y - 16}
            rx="18"
            ry="8"
            style={{ fill: ART_COLOURS.plumeLight }}
          />
          <ellipse
            cx={smoke.x + 5}
            cy={smoke.y - 6}
            rx="12"
            ry="7"
            style={{ fill: ART_COLOURS.plumeLight }}
          />
          <ellipse
            cx={smoke.x}
            cy={smoke.y + 2}
            rx="7"
            ry="5"
            style={{ fill: ART_COLOURS.plumeDark }}
          />
          <path
            d={`M${smoke.x - 7} ${smoke.y + 14} l4 -7 l3 4 l3 -6 l4 9 z`}
            style={{ fill: ROLE_VARS.warnBar }}
          />
        </g>
        <text x={smoke.x + 30} y={smoke.y + 6} style={label}>
          {SCHEMATIC_TEXT.smoke}
        </text>
        {/* The baseline, at a right angle to the line of sight, with its right-angle mark. */}
        <line
          data-art="baseline"
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          style={{ stroke: ROLE_VARS.ruleStrong, strokeWidth: 2.5, strokeDasharray: '7 5' }}
        />
        <path
          d={`M${a.x} ${a.y - 12} h12 v12`}
          style={{ fill: 'none', stroke: ROLE_VARS.ruleStrong, strokeWidth: 1.5 }}
        />
        <text x={a.x + 24} y={a.y - 26} style={label}>
          <tspan x={a.x + 24}>At least 1/3 </tspan>
          <tspan x={a.x + 24} dy="18">
            of the distance
          </tspan>
        </text>
        {/* The two pins: where you stood, and where to go next. */}
        <path data-art="pin-stood" d={pin(a.x, a.y)} style={{ fill: ROLE_VARS.accent }} />
        <circle cx={a.x} cy={a.y - 17} r="3.5" style={{ fill: ROLE_VARS.card }} />
        <path
          data-art="pin-next"
          d={pin(b.x, b.y)}
          style={{ fill: ROLE_VARS.primary, stroke: ROLE_VARS.primaryInk, strokeWidth: 1.5 }}
        />
        <circle cx={b.x} cy={b.y - 17} r="3.5" style={{ fill: ROLE_VARS.primaryInk }} />
        <text x={8} y={182} style={label}>
          {SCHEMATIC_TEXT.stood}
        </text>
        <text x={294} y={182} textAnchor="end" style={label}>
          {SCHEMATIC_TEXT.next}
        </text>
      </svg>
      <figcaption
        style={{
          margin: 0,
          fontFamily: BODY_FONT_STACK,
          fontSize: 16,
          lineHeight: 1.35,
          color: ROLE_VARS.inkDim,
        }}
      >
        {SCHEMATIC_TEXT.label}
      </figcaption>
    </figure>
  );
}
