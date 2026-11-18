// The captures of this page, each with its 1-sigma (Req 18.4). Nothing is stored: the list lives
// as long as the page.

import { formatAzimuthDeg, formatSignedDeg, type CapturedResult } from '../src/index';

export interface PlaygroundCapture {
  readonly id: string;
  /** Where it was taken: a Station's name, or "this phone". */
  readonly where: string;
  readonly result: CapturedResult;
}

const style = { fontSize: 20, margin: 0, padding: 8 } as const;

export function CaptureList({ captures }: { readonly captures: readonly PlaygroundCapture[] }) {
  if (captures.length === 0) {
    return (
      <p data-testid="capture-list" style={style}>
        No captures yet.
      </p>
    );
  }
  return (
    <ol data-testid="capture-list" style={{ ...style, paddingLeft: 40 }}>
      {captures.map((c) =>
        c.result.kind === 'bearing' ? (
          <li
            key={c.id}
            data-capture-id={c.id}
            data-kind="bearing"
            data-azimuth-rad={String(c.result.bearing.azimuthRad)}
            data-sigma-rad={String(c.result.bearing.azimuthSigmaRad)}
          >
            {`${c.where}: bearing ${formatAzimuthDeg(c.result.bearing.azimuthRad, 1)}° true ±${formatSignedDeg(c.result.bearing.azimuthSigmaRad, 1)}°`}
          </li>
        ) : (
          <li
            key={c.id}
            data-capture-id={c.id}
            data-kind="altitude"
            data-altitude-rad={String(c.result.altitude.apparentAltitudeRad)}
            data-sigma-rad={String(c.result.altitude.sigmaRad)}
          >
            {`${c.where}: altitude ${formatSignedDeg(c.result.altitude.apparentAltitudeRad, 1)}° ±${formatSignedDeg(c.result.altitude.sigmaRad, 1)}°`}
          </li>
        ),
      )}
    </ol>
  );
}
