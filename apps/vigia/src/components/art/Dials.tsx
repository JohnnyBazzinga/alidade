// Mira's two dials (design D26.3): the home dial, a ring of compass ticks with N, E, S and W around
// the big yellow "Sight the smoke" button; and the bearing dial, a smaller ring with a needle along
// a sighting's bearing, beside the numeral that says it (the dial is a picture of the numeral).
// The ticks are every 5° (thin) and every 30° (heavy), as the lead's design draws them.

import { DISPLAY_FONT_STACK, Icon, NUMERIC_FONT_STACK, ROLE_VARS } from '@alidade/ui';

/** The home dial's side at most (Mira: 320), and the button's share of it (196 in 320). */
export const HOME_DIAL_PX = 320;
const BUTTON_SHARE = 196 / 320;

export function HomeDial({ onSight }: { readonly onSight: () => void }) {
  const letter = {
    fontFamily: NUMERIC_FONT_STACK,
    fontSize: 13,
    fontWeight: 500,
    fill: ROLE_VARS.inkDim,
  } as const;
  return (
    <section
      data-testid="home-dial"
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: `min(${HOME_DIAL_PX}px, 100%)`,
        aspectRatio: '1 / 1',
        margin: '10px auto 0',
      }}
    >
      <svg
        data-art="home-dial"
        aria-hidden="true"
        viewBox="0 0 320 320"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      >
        <circle
          cx="160"
          cy="160"
          r="146"
          style={{
            fill: 'none',
            stroke: ROLE_VARS.inkDim,
            strokeOpacity: 0.55,
            strokeWidth: 8,
            strokeDasharray: '1.5 11.241',
          }}
        />
        <circle
          cx="160"
          cy="160"
          r="146"
          style={{
            fill: 'none',
            stroke: ROLE_VARS.ink,
            strokeWidth: 16,
            strokeDasharray: '3 73.445',
          }}
        />
        <circle
          cx="160"
          cy="160"
          r="110"
          style={{ fill: 'none', stroke: ROLE_VARS.rule, strokeWidth: 1.5 }}
        />
        <text
          x="160"
          y="40"
          textAnchor="middle"
          style={{ ...letter, fontSize: 16, fill: ROLE_VARS.ink }}
        >
          N
        </text>
        <text x="160" y="290" textAnchor="middle" style={letter}>
          S
        </text>
        <text x="286" y="165" textAnchor="middle" style={letter}>
          E
        </text>
        <text x="34" y="165" textAnchor="middle" style={letter}>
          W
        </text>
      </svg>
      <button
        type="button"
        data-primary="true"
        onClick={onSight}
        style={{
          position: 'absolute',
          left: `${((1 - BUTTON_SHARE) / 2) * 100}%`,
          top: `${((1 - BUTTON_SHARE) / 2) * 100}%`,
          width: `${BUTTON_SHARE * 100}%`,
          height: `${BUTTON_SHARE * 100}%`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: 0,
          borderRadius: '50%',
          border: 'none',
          background: ROLE_VARS.primary,
          color: ROLE_VARS.primaryInk,
          boxShadow: 'var(--alidade-primary-shadow)',
          fontFamily: DISPLAY_FONT_STACK,
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.6px',
          cursor: 'pointer',
        }}
      >
        <Icon name="crosshair" style={{ width: 30, height: 30 }} />
        <span>
          Sight <br />
          the smoke
        </span>
      </button>
    </section>
  );
}

/**
 * A ring with a needle along `azimuthRad` (Mira): 150 beside the saved numeral, 104 in a sighting's
 * card. `face`: the white face and the N of the larger one.
 */
export function BearingDial({
  azimuthRad,
  sizePx,
  face,
  label,
}: {
  readonly azimuthRad: number;
  readonly sizePx: number;
  readonly face: boolean;
  readonly label: string;
}) {
  const end = {
    x: 75 + 58 * Math.sin(azimuthRad),
    y: 75 - 58 * Math.cos(azimuthRad),
  };
  const needle = `M75 75L${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  return (
    <svg
      data-art="bearing-dial"
      role="img"
      aria-label={label}
      viewBox="0 0 150 150"
      width={sizePx}
      height={sizePx}
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      <circle
        cx="75"
        cy="75"
        r="66"
        style={{
          fill: 'none',
          stroke: ROLE_VARS.inkDim,
          strokeOpacity: 0.55,
          strokeWidth: 6,
          strokeDasharray: '1.5 10.019',
        }}
      />
      <circle
        cx="75"
        cy="75"
        r="66"
        style={{
          fill: 'none',
          stroke: ROLE_VARS.ink,
          strokeWidth: 12,
          strokeDasharray: '2.5 101.173',
        }}
      />
      {face && (
        <circle
          cx="75"
          cy="75"
          r="50"
          style={{ fill: ROLE_VARS.card, stroke: ROLE_VARS.rule, strokeWidth: 1.5 }}
        />
      )}
      <path
        d={needle}
        style={{ stroke: ROLE_VARS.ink, strokeWidth: face ? 7 : 9, strokeLinecap: 'round' }}
      />
      <path
        d={needle}
        style={{ stroke: ROLE_VARS.primary, strokeWidth: face ? 4 : 5, strokeLinecap: 'round' }}
      />
      <circle cx="75" cy="75" r={face ? 6 : 7} style={{ fill: ROLE_VARS.ink }} />
      {face && (
        <text
          x="75"
          y="44"
          textAnchor="middle"
          style={{
            fontFamily: NUMERIC_FONT_STACK,
            fontSize: 12,
            fontWeight: 500,
            fill: ROLE_VARS.inkDim,
          }}
        >
          N
        </text>
      )}
    </svg>
  );
}
