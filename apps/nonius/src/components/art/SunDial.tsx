// Mira's Sun dial on the Fix screen (Nonius Req 16.3; the author's design of 2026-11-28): a ring of
// ticks, thin every 5° and heavy every 30°, around two rings of the Sun's rays (the design's own
// dash patterns: 72, 12, 24 and 24 dashes on each circle), and in the middle
// the round "Sight the Sun". The drawing and the button share one grid cell, so nothing is in an
// absolute layer. Every paint is in `style` (Safari does not resolve a role's `var()` in an SVG
// attribute). The button is yellow when it is the screen's next step, and an outline otherwise.
import { DISPLAY_FONT_STACK, Icon, ROLE_VARS } from '@alidade/ui';
import { SHAPE } from '../look';
import { ART_COLOURS } from './art-colours';

/** The dial's numbers (the design: 280, the button 176). */
export const SUN_DIAL = { sizePx: 280, buttonPx: 176 } as const;

/** The words on the button, and its accessible name. */
export const SIGHT_THE_SUN = 'Sight the Sun';

export interface SunDialProps {
  /** The button is the screen's primary action: yellow, lifted, and `data-primary`. */
  readonly primary: boolean;
  readonly onSight: () => void;
}

export function SunDial({ primary, onSight }: SunDialProps) {
  const size = SUN_DIAL.sizePx;
  const c = size / 2;
  return (
    <section
      data-testid="sun-dial"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        margin: '6px auto 0',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${size} ${size}`}
        style={{ gridArea: '1 / 1', width: '100%', height: '100%', display: 'block' }}
      >
        <circle
          cx={c}
          cy={c}
          r={128}
          style={{
            fill: 'none',
            stroke: ART_COLOURS.tick,
            strokeWidth: 8,
            strokeDasharray: '1.5 9.670',
          }}
        />
        <circle
          cx={c}
          cy={c}
          r={128}
          style={{
            fill: 'none',
            stroke: ROLE_VARS.ink,
            strokeWidth: 14,
            strokeDasharray: '3 64.021',
          }}
        />
        <circle
          cx={c}
          cy={c}
          r={107}
          style={{
            fill: 'none',
            stroke: ART_COLOURS.ray,
            strokeWidth: 14,
            strokeDasharray: '3.500 24.513',
          }}
        />
        <circle
          cx={c}
          cy={c}
          r={103}
          style={{
            fill: 'none',
            stroke: ART_COLOURS.ray,
            strokeWidth: 6,
            strokeDasharray: '3 23.964',
            strokeDashoffset: '-13.500',
          }}
        />
      </svg>
      <button
        type="button"
        aria-label={SIGHT_THE_SUN}
        {...(primary ? { 'data-primary': 'true' } : {})}
        onClick={onSight}
        style={{
          gridArea: '1 / 1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          boxSizing: 'border-box',
          width: `${(SUN_DIAL.buttonPx / size) * 100}%`,
          aspectRatio: '1 / 1',
          minHeight: 62,
          padding: 0,
          borderRadius: '50%',
          border: primary ? 'none' : `1.5px solid ${ROLE_VARS.ruleStrong}`,
          background: primary ? ROLE_VARS.primary : ROLE_VARS.card,
          boxShadow: primary ? SHAPE.primaryShadow : 'none',
          color: ROLE_VARS.primaryInk,
          fontFamily: DISPLAY_FONT_STACK,
          cursor: 'pointer',
        }}
      >
        <Icon name="crosshair" style={{ width: 30, height: 30 }} />
        <span
          aria-hidden="true"
          style={{
            fontSize: 23,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.6px',
            textAlign: 'center',
          }}
        >
          Sight
          <br />
          the Sun
        </span>
      </button>
    </section>
  );
}
