// The Live readout on screen (Req 9.1, 13.4): numbers in tabular digits at 20 CSS px or more,
// each azimuth followed by the word for its North reference and by its Spread; a failure inside
// the readout is shown through `messageFor`.

import type { ReactNode } from 'react';
import { formatAzimuthDeg, formatSignedDeg } from '../math/display-format';
import { messageFor } from '../math/messages';
import type { LiveReadout } from '../math/session/session';
import { BODY_FONT_STACK, COLOURS, NUMERAL_STYLE, NUMERIC_FONT_STACK, SIZES } from './theme';
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
          <details data-part="details">
            <summary
              style={{
                minHeight: SIZES.touchPx,
                display: 'flex',
                alignItems: 'center',
                color: COLOURS.brass,
              }}
            >
              Details
            </summary>
            {children}
          </details>
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
    <details data-part="details" style={{ marginTop: SIZES.gapPx / 2 }}>
      <summary
        style={{
          minHeight: SIZES.touchPx,
          display: 'flex',
          alignItems: 'center',
          color: COLOURS.brass,
        }}
      >
        Details
      </summary>
      {inner}
    </details>
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
  return (
    <div data-testid="readout" style={box}>
      {kind === 'bearing' ? azimuth : altitude}
      {!mainFailure.ok && <FailureNotice failure={mainFailure} />}
      <p style={{ margin: 0 }} data-part="steadiness">
        {`${STEADINESS_TEXT[readout.steadiness]} hand: ${shake(spreadRad)}`}
      </p>
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
