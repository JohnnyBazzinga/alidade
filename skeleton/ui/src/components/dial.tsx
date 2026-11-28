// Mira's sighting screen (Req 22.17, design D37.12): the parts that a theme with the `dial` flag
// draws in the docked layout in place of the framed image, the readout's cards, the Details
// disclosure and the bar's square controls. The order, the controls and what each says are the
// docked layout's (Req 13.15, 13.16): only the drawing differs.
//
// The lens is the camera image cut to a circle inside a ring of compass ticks, every 5° and every
// 30°, as the lead's design draws them; the ring is decorative and does not turn with the phone.
// The crosshair is at the centre of the image, the Camera axis (Req 5.9), as the Reticle is.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { formatAzimuthDeg, formatSignedDeg } from '../math/display-format';
import { messageFor } from '../math/messages';
import type { LiveReadout } from '../math/session/session';
import type { ControlSpec } from './ControlBar';
import { FailureNotice } from './FailureNotice';
import { Icon } from './Icon';
import {
  BODY_FONT_STACK,
  COLOURS,
  DISPLAY_FONT_STACK,
  NUMERIC_FONT_STACK,
  ROLE_VARS,
  SIZES,
} from './theme';

/** The lens's side at most, in CSS px: the design's 350 at 390 wide; and at least. */
export const DIAL_LENS_MAX_PX = 350;
export const DIAL_LENS_MIN_PX = 160;
/**
 * What the column keeps for the parts around the lens, by state (the aiming row, the readout or the
 * hint, the north prompt, the tiles, the bar with the home indicator's inset): the lens takes the
 * rest of the height, between the two bounds above. Counted by Vigia's `sight-first-screen.test`.
 */
export const DIAL_RESERVE_PX = { live: 380, prompt: 510, frozen: 430 } as const;

/** The lens's side as CSS, at a reserve. */
export function dialLensSize(reservePx: number): string {
  return `min(calc(100vw - 40px), ${DIAL_LENS_MAX_PX}px, max(${DIAL_LENS_MIN_PX}px, calc(100dvh - ${reservePx}px)))`;
}
/** The lens circle's share of the ring's box: a radius of 150 in 350. */
const LENS_INSET = 25 / 350;

/** Small capitals in the numeric font: a line under a numeral, a badge (Mira's captions). */
export const CAPTION_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: NUMERIC_FONT_STACK,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '1px',
  lineHeight: 1.4,
  textTransform: 'uppercase',
  color: ROLE_VARS.inkDim,
};

/**
 * The compass ticks around the lens: every 5° thin, every 30° heavy. With a north (`northRad`, the
 * azimuth the camera points at, on a true or magnetic north), the ring turns as a compass's bezel
 * does, and its north is a yellow tick (Req 22.17 as amended 2026-11-28); with none (a Relative
 * azimuth, or no reading yet) it stands still and shows no north, because none is known.
 */
export function DialRing({
  sizeCss,
  northRad = null,
}: {
  readonly sizeCss: string;
  readonly northRad?: number | null;
}) {
  const turnDeg =
    northRad === null || !Number.isFinite(northRad) ? null : -(northRad * 180) / Math.PI;
  return (
    <svg
      data-part="dial-ring"
      data-art="dial-ring"
      aria-hidden="true"
      viewBox="0 0 350 350"
      style={{
        position: 'absolute',
        inset: 0,
        width: sizeCss,
        height: sizeCss,
        display: 'block',
        pointerEvents: 'none',
      }}
    >
      <g
        data-part="dial-bezel"
        {...(turnDeg === null ? {} : { 'data-turn-deg': turnDeg.toFixed(1) })}
        transform={turnDeg === null ? undefined : `rotate(${turnDeg.toFixed(2)} 175 175)`}
      >
        <circle
          cx="175"
          cy="175"
          r="166"
          style={{
            fill: 'none',
            stroke: ROLE_VARS.inkDim,
            strokeOpacity: 0.55,
            strokeWidth: 8,
            strokeDasharray: '1.5 12.986',
          }}
        />
        <circle
          cx="175"
          cy="175"
          r="166"
          style={{
            fill: 'none',
            stroke: ROLE_VARS.ink,
            strokeWidth: 14,
            strokeDasharray: '3 83.917',
          }}
        />
        {turnDeg !== null && (
          <g data-part="dial-north">
            <path
              d="M175 1V21"
              style={{ stroke: ROLE_VARS.ink, strokeWidth: 9, strokeLinecap: 'round' }}
            />
            <path
              d="M175 1V21"
              style={{ stroke: ROLE_VARS.primary, strokeWidth: 5, strokeLinecap: 'round' }}
            />
          </g>
        )}
      </g>
    </svg>
  );
}

/** Mira's crosshair: a ring and four arms, the primary over a dark outline, at the image's centre. */
export function DialReticle() {
  const arms = 'M38 0v22M38 54v22M0 38h22M54 38h22';
  return (
    <svg
      data-testid="reticle"
      data-art="reticle"
      data-variant="dial"
      aria-hidden="true"
      viewBox="0 0 76 76"
      width="76"
      height="76"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        marginLeft: -38,
        marginTop: -38,
        pointerEvents: 'none',
      }}
    >
      <circle
        cx="38"
        cy="38"
        r="24"
        style={{ fill: 'none', stroke: ROLE_VARS.ink, strokeWidth: 5 }}
      />
      <circle
        cx="38"
        cy="38"
        r="24"
        style={{ fill: 'none', stroke: ROLE_VARS.primary, strokeWidth: 2.5 }}
      />
      <path d={arms} style={{ stroke: ROLE_VARS.ink, strokeWidth: 5, strokeLinecap: 'round' }} />
      <path
        d={arms}
        style={{ stroke: ROLE_VARS.primary, strokeWidth: 2.5, strokeLinecap: 'round' }}
      />
    </svg>
  );
}

/**
 * The lens: a square box of `sizeCss`, the ring in it, and the image cut to the circle inside the
 * ring. `children` is the image surface, which fills the circle.
 */
export function DialLens({
  sizeCss,
  frozen,
  northRad = null,
  margin = '14px auto 0',
  children,
}: {
  readonly sizeCss: string;
  readonly frozen: boolean;
  /** The azimuth the camera points at, on a true or magnetic north; `null` for none. */
  readonly northRad?: number | null;
  readonly margin?: string;
  readonly children: ReactNode;
}) {
  const insetCss = `calc(${sizeCss} * ${LENS_INSET})`;
  return (
    <div
      data-part="image-box"
      data-variant="dial"
      style={{
        position: 'relative',
        flex: '0 0 auto',
        alignSelf: 'center',
        width: sizeCss,
        height: sizeCss,
        margin,
      }}
    >
      <DialRing sizeCss={sizeCss} northRad={northRad} />
      <div
        data-part="lens"
        style={{
          position: 'absolute',
          inset: insetCss,
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
      {frozen && (
        <span
          data-part="frozen-badge"
          style={{
            ...CAPTION_STYLE,
            position: 'absolute',
            left: '50%',
            bottom: `calc(${sizeCss} * ${34 / 350})`,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            height: 32,
            padding: '0 14px',
            borderRadius: 16,
            background: ROLE_VARS.ink,
            color: ROLE_VARS.primary,
            letterSpacing: '1.2px',
          }}
        >
          Frozen
        </span>
      )}
    </div>
  );
}

const STEADINESS_WORD = { steady: 'Steady', settling: 'Settling', unsteady: 'Unsteady' } as const;
const NORTH_WORD = {
  true: 'True north',
  magnetic: 'Magnetic north',
  relative: 'Relative',
} as const;

/** A large numeral (Mira): the display font at 64, extra bold, tabular digits. */
export const DIAL_NUMERAL_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: DISPLAY_FONT_STACK,
  fontSize: 64,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: '-2.5px',
  fontVariantNumeric: 'tabular-nums',
  color: ROLE_VARS.ink,
};

/**
 * The readout as one numeral and one caption (Req 13.16 as drawn by Mira): the Session kind's own
 * angle, then its north word, the hand's steadiness and its shake. What Details holds is given by
 * `DialDetails`.
 */
export function DialReadout({
  readout,
  kind,
  sidePx = 20,
}: {
  readonly readout: LiveReadout | null;
  readonly kind: 'bearing' | 'altitude';
  /** The side margin: `20` in the docked column, `0` in a flow that its parent pads. */
  readonly sidePx?: number;
}) {
  const column: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: `12px ${sidePx}px 0`,
    textAlign: 'center',
  };
  if (readout === null) {
    return (
      <div data-testid="readout" data-variant="dial" style={column}>
        <p style={CAPTION_STYLE}>No readings yet.</p>
      </div>
    );
  }
  const main = kind === 'bearing' ? readout.azimuth : readout.apparentAltitudeRad;
  const spreadRad = kind === 'bearing' ? readout.azimuthSpreadRad : readout.altitudeStdDevRad;
  const shake =
    spreadRad === null ? 'shake not measured' : `shake ±${formatSignedDeg(spreadRad, 2)}°`;
  const staleMessage = readout.stale ? messageFor({ ok: false, reason: 'stale_samples' }) : null;
  let numeral: string | null = null;
  let word = 'Altitude';
  if (kind === 'bearing' && readout.azimuth.ok) {
    numeral = `${formatAzimuthDeg(readout.azimuth.value.azimuthRad, 1)}°`;
    word = NORTH_WORD[readout.azimuth.value.northReference];
  } else if (kind === 'altitude' && readout.apparentAltitudeRad.ok) {
    numeral = `${formatSignedDeg(readout.apparentAltitudeRad.value, 1)}°`;
  }
  return (
    <div data-testid="readout" data-variant="dial" style={column}>
      {!main.ok && <FailureNotice failure={main} />}
      {numeral !== null && (
        <p data-part={kind === 'bearing' ? 'azimuth' : 'altitude'} style={DIAL_NUMERAL_STYLE}>
          {numeral}
        </p>
      )}
      <p data-part="steadiness" style={CAPTION_STYLE}>
        {numeral !== null ? `${word} · ` : ''}
        {`${STEADINESS_WORD[readout.steadiness]} hand · ${shake}`}
      </p>
      {staleMessage !== null && (
        <p
          data-part="stale"
          style={{ margin: 0, fontFamily: BODY_FONT_STACK, color: COLOURS.alert }}
        >
          {staleMessage.whatHappened} {staleMessage.whatToDo}
        </p>
      )}
    </div>
  );
}

/** What Details holds in the dial: the other angle, its shake and the count of readings. */
export function DialDetails({
  readout,
  kind,
}: {
  readonly readout: LiveReadout | null;
  readonly kind: 'bearing' | 'altitude';
}) {
  if (readout === null) return null;
  const otherSpreadRad = kind === 'bearing' ? readout.altitudeStdDevRad : readout.azimuthSpreadRad;
  const shake =
    otherSpreadRad === null
      ? 'shake not measured'
      : `shake ±${formatSignedDeg(otherSpreadRad, 2)}°`;
  const line: CSSProperties = { margin: 0, fontFamily: BODY_FONT_STACK, fontSize: 14 };
  return (
    <>
      {kind === 'bearing' && readout.apparentAltitudeRad.ok && (
        <p data-part="altitude" style={line}>
          {formatSignedDeg(readout.apparentAltitudeRad.value, 1)}° altitude
        </p>
      )}
      {kind === 'altitude' && readout.azimuth.ok && (
        <p data-part="azimuth" style={line}>
          {formatAzimuthDeg(readout.azimuth.value.azimuthRad, 1)}°{' '}
          {readout.azimuth.value.northReference}
        </p>
      )}
      <p data-part="other-shake" style={line}>
        {`${kind === 'bearing' ? 'Altitude' : 'Azimuth'} ${shake}, ${readout.sampleCount} readings`}
      </p>
    </>
  );
}

/** A tile (Mira): white, a light edge, a radius of 16, its words at 14 and a chevron at the end. */
export function tileStyle(heightPx = 54): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    boxSizing: 'border-box',
    minHeight: heightPx,
    minWidth: 0,
    padding: '6px 14px',
    borderRadius: 'var(--alidade-tile-radius, 16px)',
    border: `1px solid ${ROLE_VARS.rule}`,
    background: ROLE_VARS.card,
    color: ROLE_VARS.ink,
    fontFamily: BODY_FONT_STACK,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
    textAlign: 'start',
    cursor: 'pointer',
  };
}

/**
 * The two tiles under the readout: Details, which opens in place, and "Other ways to set north",
 * which opens its view (absent when north is not asked for). `details` is what opens.
 */
export function DialTiles({
  details,
  onOtherWays,
  sidePx = 20,
}: {
  readonly details: ReactNode;
  readonly onOtherWays: (() => void) | null;
  /** The side margin: `20` in the docked column, `0` in a flow that its parent pads. */
  readonly sidePx?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-part="tiles"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: `16px ${sidePx}px 0` }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: onOtherWays === null ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <button
          type="button"
          data-part="details"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={tileStyle()}
        >
          <span>Details</span>
          <Icon
            name="chevron-down"
            style={{
              color: ROLE_VARS.inkDim,
              transform: open ? 'rotate(180deg)' : 'none',
              flex: '0 0 auto',
            }}
          />
        </button>
        {onOtherWays !== null && (
          <button
            type="button"
            data-part="other-ways"
            onClick={onOtherWays}
            style={{ ...tileStyle(), fontSize: 13 }}
          >
            <span>Other ways to set north</span>
            <Icon name="chevron-right" style={{ color: ROLE_VARS.inkDim, flex: '0 0 auto' }} />
          </button>
        )}
      </div>
      {open && (
        <div
          data-part="details-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: SIZES.gapPx,
            padding: '12px 14px',
            borderRadius: 'var(--alidade-tile-radius, 16px)',
            border: `1px solid ${ROLE_VARS.rule}`,
            background: ROLE_VARS.card,
            color: ROLE_VARS.ink,
          }}
        >
          {details}
        </div>
      )}
    </div>
  );
}

function pill(primary: boolean, heightPx: number): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    boxSizing: 'border-box',
    minHeight: heightPx,
    padding: '6px 16px',
    borderRadius: heightPx / 2,
    border: primary ? 'none' : `1.5px solid ${ROLE_VARS.ruleStrong}`,
    background: primary ? ROLE_VARS.primary : 'transparent',
    boxShadow: primary ? 'var(--alidade-primary-shadow, none)' : 'none',
    color: primary ? ROLE_VARS.primaryInk : ROLE_VARS.ink,
    fontFamily: BODY_FONT_STACK,
    fontSize: primary ? 19 : 16,
    fontWeight: primary ? 800 : 600,
    lineHeight: 1.15,
    cursor: 'pointer',
  };
}

function DialButton({
  control: c,
  style,
}: {
  readonly control: ControlSpec;
  readonly style: CSSProperties;
}) {
  return (
    <button
      type="button"
      data-control={c.id}
      data-primary={c.primary === true ? 'true' : 'false'}
      disabled={c.disabled === true}
      onClick={c.onPress}
      style={style}
    >
      {c.icon !== undefined && <Icon name={c.icon} style={{ flex: '0 0 auto' }} />}
      {c.label}
    </button>
  );
}

/**
 * The bar of the dial (Req 13.15 as drawn by Mira): the page's own colour, no rule; Back a round
 * control of 62 beside the current action, a pill of 62; while frozen, Capture and then "Back to
 * live", each the row's width. The text part (the starting line, a refusal) is above the controls.
 */
export function DialBar({
  text,
  controls,
  back,
  sidePx = 20,
}: {
  readonly text: ReactNode;
  readonly controls: readonly ControlSpec[];
  readonly back?: ControlSpec;
  /** The side margin: `20` in the docked column, `0` in a flow that its parent pads. */
  readonly sidePx?: number;
}) {
  const hasText = text !== null && text !== undefined && text !== false;
  const [first, ...rest] = controls;
  return (
    <div
      data-testid="control-bar"
      data-placement="docked"
      data-variant="dial"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: `12px ${sidePx}px 16px`,
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        background: COLOURS.bg,
      }}
    >
      {hasText && (
        <div
          data-part="bar-text"
          style={{
            maxHeight: '30dvh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: SIZES.gapPx,
          }}
        >
          {text}
        </div>
      )}
      {(first !== undefined || back !== undefined) && (
        <div data-part="bar-row" style={{ display: 'flex', gap: 10 }}>
          {back !== undefined && (
            <button
              type="button"
              data-control={back.id}
              data-primary="false"
              aria-label={back.label}
              onClick={back.onPress}
              style={{
                ...pill(false, 62),
                flex: '0 0 auto',
                width: 62,
                padding: 0,
              }}
            >
              <Icon name="chevron-left" />
            </button>
          )}
          {first !== undefined && (
            <DialButton
              control={first}
              style={{
                ...pill(first.primary === true, 62),
                flex: '1 1 0',
                ...(first.primary === true ? {} : { fontSize: 16 }),
                ...(first.label.length > 18 && first.primary === true ? { fontSize: 16 } : {}),
              }}
            />
          )}
        </div>
      )}
      {rest.map((c) => (
        <DialButton
          key={c.id}
          control={c}
          style={{ ...pill(c.primary === true, 54), width: '100%' }}
        />
      ))}
    </div>
  );
}
