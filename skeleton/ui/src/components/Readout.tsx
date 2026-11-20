// The Live readout on screen (Req 9.1, 13.4): numbers in tabular digits at 20 CSS px or more,
// each azimuth followed by the word for its North reference and by its Spread; a failure inside
// the readout is shown through `messageFor`.

import { formatAzimuthDeg, formatSignedDeg } from '../math/display-format';
import { messageFor } from '../math/messages';
import type { LiveReadout } from '../math/session/session';
import { COLOURS, FONT_STACK, NUMERAL_STYLE, SIZES } from './theme';
import { FailureNotice } from './FailureNotice';

const STEADINESS_TEXT = {
  steady: 'Steady',
  settling: 'Settling',
  unsteady: 'Unsteady',
} as const;

export function Readout({ readout }: { readonly readout: LiveReadout | null }) {
  const box = {
    ...NUMERAL_STYLE,
    fontFamily: FONT_STACK,
    fontSize: SIZES.labelPx,
    // Set, not left to the font, so that an app can count the readout's height (task 30.4).
    lineHeight: 1.25,
    background: COLOURS.panel,
    color: COLOURS.ink,
    padding: SIZES.gapPx,
  } as const;
  if (readout === null) {
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
  const staleMessage = readout.stale ? messageFor({ ok: false, reason: 'stale_samples' }) : null;
  return (
    <div data-testid="readout" style={box}>
      {readout.azimuth.ok ? (
        <p style={{ margin: 0 }} data-part="azimuth">
          <span style={{ fontSize: SIZES.numeralPx }}>
            {formatAzimuthDeg(readout.azimuth.value.azimuthRad, 1)}°
          </span>{' '}
          {readout.azimuth.value.northReference}
        </p>
      ) : (
        <FailureNotice failure={readout.azimuth} />
      )}
      {readout.apparentAltitudeRad.ok ? (
        <p style={{ margin: 0 }} data-part="altitude">
          <span style={{ fontSize: SIZES.numeralPx }}>
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
