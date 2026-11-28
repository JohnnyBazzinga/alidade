// The drawing of the rule of thumb (Nonius Req 16.3; the author's design of 2026-11-28): one place
// on the ground, two lines of sight to two Suns, the angle between them marked with the least turn.
// Every paint is in `style` (Safari does not resolve a role's `var()` in an SVG attribute).
import { NUMERIC_FONT_STACK, ROLE_VARS } from '@alidade/ui';
import { ART_COLOURS } from './art-colours';

export interface TurnDrawingProps {
  /** The least turn as the rule says it, "20°"; none draws the angle without a label. */
  readonly label: string | null;
}

export function TurnDrawing({ label }: TurnDrawingProps) {
  return (
    <svg
      role="img"
      aria-label={`Two Sun positions seen from one place, at least ${label ?? 'the stated angle'} apart`}
      viewBox="0 0 76 92"
      style={{ flex: '0 0 auto', width: 76, height: 92 }}
    >
      <path
        d="M4 84H72"
        style={{ stroke: ART_COLOURS.tick, strokeWidth: 1.5, strokeLinecap: 'round' }}
      />
      <path
        d="M38 84L14 30M38 84L62 30"
        style={{
          stroke: ROLE_VARS.ink,
          strokeWidth: 1.5,
          strokeDasharray: '3 3',
          strokeLinecap: 'round',
        }}
      />
      <path
        d="M27.800 61A25 25 0 0 1 48.200 61"
        style={{ fill: 'none', stroke: ROLE_VARS.ink, strokeWidth: 1.5 }}
      />
      <circle
        cx={14}
        cy={24}
        r={9}
        style={{ fill: ART_COLOURS.sunEarlier, stroke: ART_COLOURS.ray, strokeWidth: 1.5 }}
      />
      <circle
        cx={62}
        cy={24}
        r={9}
        style={{ fill: ROLE_VARS.primary, stroke: ROLE_VARS.ink, strokeWidth: 1.5 }}
      />
      <circle cx={38} cy={84} r={4.5} style={{ fill: ROLE_VARS.ink }} />
      {label !== null && (
        <text
          x={38}
          y={52}
          textAnchor="middle"
          style={{
            fontFamily: NUMERIC_FONT_STACK,
            fontSize: 11,
            fontWeight: 500,
            fill: ROLE_VARS.ink,
          }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
