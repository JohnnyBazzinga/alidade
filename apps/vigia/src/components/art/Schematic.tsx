// The schematic of "Where to sight from next" (Req 22.12, design D26.4): Mira's drawing. Pin 1,
// where you stood, looks at the smoke on a hill; footsteps lead sideways to pin 2, where to go next,
// at least a third of the distance away; from there a second line of sight meets the first at the
// smoke. Not to scale and with no number as a place: its name says so, and so does the line under
// it. The legend of the two pins is under the drawing.

import { BODY_FONT_STACK, ROLE_VARS } from '@alidade/ui';
import { SCHEMATIC_TEXT } from '../../math/texts';
import { LOOK } from '../look';
import { ART_COLOURS as C } from './art-colours';

const STEPS: readonly (readonly [number, number, number])[] = [
  [86, 131, -12],
  [103, 138.9, 12],
  [120, 134.5, -12],
  [137, 141.6, 12],
  [154, 136, -12],
  [171, 141.6, 12],
  [188, 134.5, -12],
  [205, 138.9, 12],
  [222, 131, -12],
];

/** A pin whose point is at (x, 142), as the design draws it. */
const pin = (x: number) =>
  `M${x} 142C${x - 13} 127 ${x - 11} 110 ${x} 110C${x + 11} 110 ${x + 13} 127 ${x} 142Z`;

function LegendDisc({ n, filled }: { readonly n: number; readonly filled: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        boxSizing: 'border-box',
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: filled ? 'none' : `2px solid ${ROLE_VARS.ink}`,
        background: filled ? ROLE_VARS.ink : ROLE_VARS.primary,
        color: filled ? ROLE_VARS.card : ROLE_VARS.ink,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {n}
    </span>
  );
}

export function Schematic() {
  const words = { fontFamily: BODY_FONT_STACK, fill: ROLE_VARS.ink } as const;
  return (
    <figure
      data-testid="schematic"
      style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <svg
        data-art="schematic"
        role="img"
        aria-label={SCHEMATIC_TEXT.label}
        viewBox="0 0 312 172"
        width="100%"
        style={{ display: 'block', height: 'auto' }}
      >
        <defs>
          <clipPath id="vigia-schematic-plan">
            <rect width="312" height="172" rx="18" />
          </clipPath>
        </defs>
        <g clipPath="url(#vigia-schematic-plan)">
          <rect width="312" height="172" style={{ fill: C.sky }} />
          <circle cx="268" cy="30" r="13" style={{ fill: C.sun }} />
          <g style={{ fill: ROLE_VARS.card }}>
            <ellipse cx="52" cy="26" rx="20" ry="7" />
            <ellipse cx="66" cy="20" rx="13" ry="7" />
            <ellipse cx="244" cy="62" rx="16" ry="5" />
          </g>
          <path d="M70 100C110 44 190 40 244 100Z" style={{ fill: C.hill }} />
          <path d="M0 98C80 82 220 86 312 102V172H0Z" style={{ fill: C.groundFar }} />
          <path d="M0 150C90 132 230 136 312 152V172H0Z" style={{ fill: C.groundNear }} />
          <path
            d="M22 100l5-13 5 13zM34 104l5-15 5 15zM280 104l5-14 5 14zM293 100l5-12 5 12zM264 108l4-11 4 11z"
            style={{ fill: C.trees }}
          />
          <g data-art="smoke">
            <circle cx="160" cy="46" r="7" style={{ fill: C.puff1 }} />
            <circle cx="170" cy="33" r="10" style={{ fill: C.puff2 }} />
            <circle cx="185" cy="21" r="13" style={{ fill: C.puff3 }} />
            <circle cx="166" cy="29" r="5" style={{ fill: C.puff4 }} />
            <circle cx="180" cy="15" r="6" style={{ fill: C.puff5 }} />
            <path d="M152 56q2-9 5-12q3 4 5 12z" style={{ fill: C.flame }} />
            <path d="M155 56q1-5 2.5-6q1.5 2 2.5 6z" style={{ fill: C.flameCore }} />
          </g>
          <g data-art="line-of-sight">
            <path
              d="M60 110L154 56"
              style={{
                stroke: ROLE_VARS.primary,
                strokeWidth: 7,
                strokeLinecap: 'round',
                strokeOpacity: 0.7,
              }}
            />
            <path
              d="M60 110L154 56"
              style={{ stroke: ROLE_VARS.ink, strokeWidth: 2.2, strokeLinecap: 'round' }}
            />
            <path
              d="M252 110L160 56"
              style={{
                stroke: ROLE_VARS.primary,
                strokeWidth: 7,
                strokeLinecap: 'round',
                strokeOpacity: 0.45,
              }}
            />
            <path
              d="M252 110L160 56"
              style={{
                stroke: ROLE_VARS.ink,
                strokeWidth: 1.8,
                strokeLinecap: 'round',
                strokeDasharray: '1 6',
              }}
            />
          </g>
          <g data-art="steps" style={{ fill: ROLE_VARS.ink, fillOpacity: 0.75 }}>
            {STEPS.map(([x, y, a]) => (
              <ellipse
                key={x}
                cx={x}
                cy={y}
                rx="4.2"
                ry="2.3"
                transform={`rotate(${a} ${x} ${y})`}
              />
            ))}
          </g>
          <path
            d="M232 131l7 5-7 5"
            style={{
              fill: 'none',
              stroke: ROLE_VARS.ink,
              strokeWidth: 2,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }}
          />
          <circle cx="252" cy="126" r="24" style={{ fill: ROLE_VARS.primary, fillOpacity: 0.3 }} />
          <path
            data-art="pin-stood"
            d={pin(60)}
            style={{
              fill: ROLE_VARS.ink,
              stroke: ROLE_VARS.ink,
              strokeWidth: 2.5,
              strokeLinejoin: 'round',
            }}
          />
          <text
            x="60"
            y="126.5"
            textAnchor="middle"
            style={{ ...words, fontSize: 13, fontWeight: 800, fill: ROLE_VARS.card }}
          >
            1
          </text>
          <path
            data-art="pin-next"
            d={pin(252)}
            style={{
              fill: ROLE_VARS.primary,
              stroke: ROLE_VARS.ink,
              strokeWidth: 2.5,
              strokeLinejoin: 'round',
            }}
          />
          <text
            x="252"
            y="126.5"
            textAnchor="middle"
            style={{ ...words, fontSize: 13, fontWeight: 800 }}
          >
            2
          </text>
          <rect x="82" y="148" width="148" height="20" rx="10" style={{ fill: ROLE_VARS.card }} />
          <text
            x="156"
            y="162"
            textAnchor="middle"
            style={{ ...words, fontSize: 10.5, fontWeight: 600 }}
          >
            {SCHEMATIC_TEXT.baseline}
          </text>
          <text x="204" y="26" style={{ ...words, fontSize: 12, fontWeight: 800 }}>
            {SCHEMATIC_TEXT.smoke}
          </text>
          <text
            x="100"
            y="78"
            textAnchor="middle"
            transform="rotate(-30 100 78)"
            style={{ ...words, fontSize: 10.5, fill: C.lineWords }}
          >
            {SCHEMATIC_TEXT.sight}
          </text>
        </g>
      </svg>
      <div
        data-part="legend"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 16px',
          fontFamily: BODY_FONT_STACK,
          fontSize: 13,
          fontWeight: 600,
          color: ROLE_VARS.ink,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <LegendDisc n={1} filled />
          {SCHEMATIC_TEXT.stood}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <LegendDisc n={2} filled={false} />
          {SCHEMATIC_TEXT.next}
        </span>
      </div>
      <figcaption style={{ ...LOOK.dim, fontSize: 12, lineHeight: 1.5 }}>
        {SCHEMATIC_TEXT.label}
      </figcaption>
    </figure>
  );
}
