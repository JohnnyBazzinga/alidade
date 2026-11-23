// The Live readout on screen (Req 9.1, 13.4): numbers in tabular digits at 20 CSS px or more,
// each azimuth followed by the word for its North reference and by its Spread; a failure inside
// the readout is shown through `messageFor`.

import type { CSSProperties, ReactNode } from 'react';
import { formatAzimuthDeg, formatSignedDeg } from '../math/display-format';
import { messageFor } from '../math/messages';
import type { LiveReadout } from '../math/session/session';
import {
  BODY_FONT_STACK,
  COLOURS,
  NUMERAL_STYLE,
  NUMERIC_FONT_STACK,
  ROLE_VARS,
  SIZES,
} from './theme';
import { Disclosure } from './Disclosure';
import { Icon } from './Icon';
import { FailureNotice } from './FailureNotice';

const STEADINESS_TEXT = {
  steady: 'Steady',
  settling: 'Settling',
  unsteady: 'Unsteady',
} as const;

export interface ReadoutProps {
  readonly readout: LiveReadout | null;
  /**
   * The docked layout's readout (Req 13.16): the Session kind's own angle with its word, one
   * labelled shake line, the stale line; the rest, and `children`, under "Details".
   */
  readonly compact?: boolean;
  /** Which angle is the main one when `compact`; a bearing Session by default. */
  readonly kind?: 'bearing' | 'altitude';
  /** Under "Details" when `compact`; ignored otherwise. */
  readonly children?: ReactNode;
}

export function Readout({ readout, compact = false, kind = 'bearing', children }: ReadoutProps) {
  const box = {
    ...NUMERAL_STYLE,
    fontFamily: BODY_FONT_STACK,
    fontSize: SIZES.labelPx,
    // Set, not left to the font, so that an app can count the readout's height (task 30.4).
    lineHeight: 1.25,
    background: COLOURS.panel,
    color: COLOURS.ink,
    padding: SIZES.gapPx,
  } as const;
  if (readout === null) {
    if (compact) {
      return (
        <div data-testid="readout" style={box}>
          <p style={{ margin: 0 }}>No readings yet.</p>
          <Disclosure summary="Details" part="details">
            {children}
          </Disclosure>
        </div>
      );
    }
    return (
      <div data-testid="readout" style={box}>
        <p style={{ margin: 0 }}>No readings yet.</p>
      </div>
    );
  }
  // The Spread and the altitudes' standard deviation are the steadiness of the hand, on their own
  // labelled line, never a bare ± beside the azimuth or the altitude (Req 13.4): the azimuth's
  // uncertainty also holds north, the Declination and the lens, and the capture shows it.
  const shake =
    readout.azimuthSpreadRad === null || readout.altitudeStdDevRad === null
      ? 'shake not measured'
      : `shake ±${formatSignedDeg(readout.azimuthSpreadRad, 2)}° in azimuth, ±${formatSignedDeg(readout.altitudeStdDevRad, 2)}° in altitude`;
  const detailsBox = (inner: ReactNode) => (
    <Disclosure summary="Details" part="details" style={{ marginTop: SIZES.gapPx / 2 }}>
      {inner}
    </Disclosure>
  );
  if (compact) return compactReadout(readout, box, kind, detailsBox, children);
  const staleMessage = readout.stale ? messageFor({ ok: false, reason: 'stale_samples' }) : null;
  return (
    <div data-testid="readout" style={box}>
      {readout.azimuth.ok ? (
        <p style={{ margin: 0 }} data-part="azimuth">
          <span style={{ fontSize: SIZES.numeralPx, fontFamily: NUMERIC_FONT_STACK }}>
            {formatAzimuthDeg(readout.azimuth.value.azimuthRad, 1)}°
          </span>{' '}
          {readout.azimuth.value.northReference}
        </p>
      ) : (
        <FailureNotice failure={readout.azimuth} />
      )}
      {readout.apparentAltitudeRad.ok ? (
        <p style={{ margin: 0 }} data-part="altitude">
          <span style={{ fontSize: SIZES.numeralPx, fontFamily: NUMERIC_FONT_STACK }}>
            {formatSignedDeg(readout.apparentAltitudeRad.value, 1)}°
          </span>{' '}
          altitude
        </p>
      ) : (
        <FailureNotice failure={readout.apparentAltitudeRad} />
      )}
      <p style={{ margin: 0 }} data-part="steadiness">
        {`${STEADINESS_TEXT[readout.steadiness]} hand: ${shake}, ${readout.sampleCount} readings`}
      </p>
      {staleMessage !== null && (
        <p style={{ margin: 0, color: COLOURS.alert }} data-part="stale">
          {staleMessage.whatHappened} {staleMessage.whatToDo}
        </p>
      )}
    </div>
  );
}

/** The compact form (Req 13.16): what `Details` holds is the other angle, its shake, the count. */
function compactReadout(
  readout: LiveReadout,
  box: object,
  kind: 'bearing' | 'altitude',
  detailsBox: (inner: ReactNode) => ReactNode,
  children: ReactNode,
) {
  const spreadRad = kind === 'bearing' ? readout.azimuthSpreadRad : readout.altitudeStdDevRad;
  const otherSpreadRad = kind === 'bearing' ? readout.altitudeStdDevRad : readout.azimuthSpreadRad;
  const shake = (rad: number | null) =>
    rad === null ? 'shake not measured' : `shake ±${formatSignedDeg(rad, 2)}°`;
  // In Details, the other angle as the flow layout writes it.
  const azimuth = readout.azimuth.ok ? (
    <p style={{ margin: 0 }} data-part="azimuth">
      <span style={{ fontSize: SIZES.numeralPx, fontFamily: NUMERIC_FONT_STACK }}>
        {formatAzimuthDeg(readout.azimuth.value.azimuthRad, 1)}°
      </span>{' '}
      {readout.azimuth.value.northReference}
    </p>
  ) : null;
  const altitude = readout.apparentAltitudeRad.ok ? (
    <p style={{ margin: 0 }} data-part="altitude">
      <span style={{ fontSize: SIZES.numeralPx, fontFamily: NUMERIC_FONT_STACK }}>
        {formatSignedDeg(readout.apparentAltitudeRad.value, 1)}°
      </span>{' '}
      altitude
    </p>
  ) : null;
  const mainFailure = kind === 'bearing' ? readout.azimuth : readout.apparentAltitudeRad;
  const staleMessage = readout.stale ? messageFor({ ok: false, reason: 'stale_samples' }) : null;
  // The main angle's card (Req 22.11): the numeral on a line of its own, with the card's whole
  // width, then a line that starts with the icon and holds the word. The text of the paragraph is
  // today's (`90.0° true`), so that the wording tests stand.
  let main: ReactNode = null;
  if (kind === 'bearing' && readout.azimuth.ok) {
    main = mainCard(
      'azimuth',
      `${formatAzimuthDeg(readout.azimuth.value.azimuthRad, 1)}°`,
      readout.azimuth.value.northReference,
      'navigation',
    );
  } else if (kind === 'altitude' && readout.apparentAltitudeRad.ok) {
    main = mainCard(
      'altitude',
      `${formatSignedDeg(readout.apparentAltitudeRad.value, 1)}°`,
      'altitude',
      'crosshair',
    );
  }
  return (
    <div
      data-testid="readout"
      style={{
        ...(box as object),
        background: 'transparent',
        padding: `${SIZES.gapPx}px ${COMPACT_MARGIN_PX}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx,
      }}
    >
      {!mainFailure.ok && <FailureNotice failure={mainFailure} />}
      <div data-part="cards" style={{ display: 'flex', gap: SIZES.gapPx, alignItems: 'stretch' }}>
        {main}
        <div data-part="card" style={cardStyle('infoTint')}>
          <p data-part="steadiness" style={sentenceLine}>
            <Icon name="vibrate" style={inlineIcon(ROLE_VARS.infoIcon)} />
            {`${STEADINESS_TEXT[readout.steadiness]} hand: ${shake(spreadRad)}`}
          </p>
        </div>
      </div>
      {staleMessage !== null && (
        <p style={{ margin: 0, color: COLOURS.alert }} data-part="stale">
          {staleMessage.whatHappened} {staleMessage.whatToDo}
        </p>
      )}
      {detailsBox(
        <>
          {kind === 'bearing' ? altitude : azimuth}
          <p style={{ margin: 0 }} data-part="other-shake">
            {`${kind === 'bearing' ? 'Altitude' : 'Azimuth'} ${shake(otherSpreadRad)}, ${readout.sampleCount} readings`}
          </p>
          {children}
        </>,
      )}
    </div>
  );
}

/**
 * The side margins of the compact readout and the cards' inner padding (D37.10, as counted by task
 * 35.7): at `375` each card's text is `(375 - 24 - 8) / 2 - 20 = 151` wide, 12 characters at 20 by
 * the `0.63 em` bound, so the longest steadiness sentence takes three lines.
 */
export const COMPACT_MARGIN_PX = 12;
export const CARD_PADDING_PX = 10;
/** An icon that starts a sentence: inline, so that the words wrap under it (Req 22.11). */
export const INLINE_ICON_GAP_PX = 6;

function inlineIcon(colour: string): CSSProperties {
  return {
    display: 'inline-block',
    verticalAlign: '-5px',
    marginRight: INLINE_ICON_GAP_PX,
    color: colour,
  };
}

/** A sentence that starts with an inline icon (Req 22.11, task 35.7). */
const sentenceLine: CSSProperties = {
  margin: 0,
  fontFamily: BODY_FONT_STACK,
  fontSize: SIZES.labelPx,
  lineHeight: 1.25,
};

function cardStyle(tint: 'warnTint' | 'infoTint'): CSSProperties {
  return {
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: CARD_PADDING_PX,
    background: ROLE_VARS[tint],
    borderRadius: 'var(--alidade-card-radius)',
    boxShadow: 'var(--alidade-shadow)',
  };
}

/** A line that starts with an icon and continues with words (Req 22.11). */
const wordLine: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  fontFamily: BODY_FONT_STACK,
  fontSize: SIZES.labelPx,
  lineHeight: 1.25,
};

function mainCard(
  part: 'azimuth' | 'altitude',
  numeral: string,
  word: string,
  icon: 'navigation' | 'crosshair',
): ReactNode {
  return (
    <div data-part="card" style={cardStyle('warnTint')}>
      <p data-part={part} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          data-part="numeral"
          style={{
            display: 'block',
            fontSize: SIZES.numeralPx,
            fontFamily: NUMERIC_FONT_STACK,
            lineHeight: 1.2,
            color: ROLE_VARS.ink,
            whiteSpace: 'nowrap',
          }}
        >
          {numeral}
        </span>{' '}
        <span data-part="north-word" style={{ ...wordLine, color: ROLE_VARS.warnInk }}>
          <Icon name={icon} style={{ color: ROLE_VARS.warnIcon }} />
          {word}
        </span>
      </p>
    </div>
  );
}
