// A captured result with its uncertainty (Req 13.5, 13.6, 12.6): the 1-sigma beside the value, and
// each part of what it is made of with that part's own 1-sigma, as the captured result carries it:
// the hand's shake (the Spread, or the altitudes' standard deviation, as Sensors summarised them),
// the north reference (the phone's compass with the heading 1-sigma, or the Yaw reference with
// where it came from), the Declination Sensors used, and the lens and tap as they enter the
// result. A part the capture did not use is left out. The prop is the whole `CapturedResult`,
// which carries its sigma, so a bearing or an altitude cannot be shown without it.

import { formatAzimuthDeg, formatSignedDeg } from '../math/display-format';
import type { CaptureNorth, CapturedResult } from '../math/session/session';
import { LimitsNote } from './LimitsNote';
import { COLOURS, FONT_STACK, NUMERAL_STYLE, SIZES } from './theme';

const deg1 = (rad: number): string => `±${formatSignedDeg(rad, 1)}°`;
const deg2 = (rad: number): string => `±${formatSignedDeg(rad, 2)}°`;

const SHAKE = 'how much the readings scattered while you sighted.';

function northLine(north: CaptureNorth): string {
  switch (north.source) {
    case 'phone-compass':
      return `North from the phone\u2019s compass ${deg2(north.sigmaRad)}: the heading accuracy the app assumes.`;
    case 'compass':
      return `North set from the compass ${deg2(north.sigmaRad)}.`;
    case 'known-azimuth':
      return `North set from a known azimuth ${deg2(north.sigmaRad)}.`;
  }
}

export function CaptureSummary({ result }: { readonly result: CapturedResult }) {
  const lines: string[] = [];
  let headline: string;
  if (result.kind === 'bearing') {
    headline = `Bearing ${formatAzimuthDeg(result.bearing.azimuthRad, 1)}° true, 1-sigma ${deg1(result.bearing.azimuthSigmaRad)}`;
    lines.push(`Hand shake ${deg2(result.azimuthSpreadRad)}: ${SHAKE}`);
    if (result.north !== null) lines.push(northLine(result.north));
    if (result.declination !== null) {
      lines.push(`Declination ${deg2(result.declination.sigmaRad)}: from magnetic to true north.`);
    }
  } else {
    headline = `Altitude ${formatSignedDeg(result.altitude.apparentAltitudeRad, 1)}°, 1-sigma ${deg1(result.altitude.sigmaRad)}`;
    lines.push(`Hand shake ${deg2(result.altitudeStdDevRad)}: ${SHAKE}`);
    lines.push(
      `Altitude calibration ${deg2(result.altitude.calibration.sigmaRad)}: the uncertainty of the phone\u2019s altitude offset.`,
    );
  }
  if (result.markSigmaRad !== null) {
    lines.push(
      `Lens and tap ${deg2(result.markSigmaRad)}: the lens\u2019s field of view and your tap.`,
    );
  }
  return (
    <section
      data-testid="capture-summary"
      style={{
        ...NUMERAL_STYLE,
        fontFamily: FONT_STACK,
        fontSize: SIZES.labelPx,
        background: COLOURS.panel,
        color: COLOURS.ink,
        padding: SIZES.gapPx,
      }}
    >
      <p data-part="headline" style={{ margin: 0, fontSize: SIZES.numeralPx }}>
        {headline}
      </p>
      <p style={{ margin: 0, color: COLOURS.inkDim }}>Made of:</p>
      <ul data-part="made-of" style={{ margin: 0, paddingLeft: SIZES.gapPx * 2 }}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <LimitsNote />
    </section>
  );
}
