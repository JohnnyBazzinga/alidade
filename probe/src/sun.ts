import { Body, Equator, Horizon, Observer } from 'astronomy-engine';

export interface HorizontalCoordsDeg {
  /** Azimuth clockwise from true north, [0, 360). */
  azimuthDeg: number;
  /** Altitude above the horizon, [-90, 90]. */
  altitudeDeg: number;
}

/**
 * The Sun's apparent horizontal coordinates for an observer at the given
 * latitude/longitude (degrees) and time. Refraction is included (`'normal'`)
 * so the result matches what the phone camera actually sees through the
 * atmosphere — the apples-to-apples comparison for the probe.
 */
export function sunHorizontalDeg(
  date: Date,
  latDeg: number,
  lonDeg: number,
): HorizontalCoordsDeg {
  const observer = new Observer(latDeg, lonDeg, 0);
  // ofdate=true, aberration=true: apparent equatorial coordinates for the instant.
  const eq = Equator(Body.Sun, date, observer, true, true);
  // Refraction model 'normal' lifts altitude for atmospheric refraction.
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const azimuthDeg = ((hor.azimuth % 360) + 360) % 360;
  return { azimuthDeg, altitudeDeg: hor.altitude };
}
