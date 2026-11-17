// Default parameters (Req 10.1). Every function of the package takes these values as
// parameters and never reads them implicitly (Req 10.2); they are here so that an app can start
// from measured, named values and show in its own code which values it chose.

const RAD_PER_DEG = Math.PI / 180;

/** Length of a Sighting window: 1000 ms. */
export const SIGHTING_WINDOW_LENGTH_MS = 1000;

/**
 * Minimum number of samples in a Sighting window: 10. With the 1000 ms window this assumes an
 * orientation event rate of at least 10 Hz (Req 10.4). The rate is not yet measured on the test
 * phones (requirements, device check 2).
 */
export const MIN_SAMPLE_COUNT = 10;

/** The newest sample of a window may be at most 500 ms older than the window's end. */
export const SAMPLE_STALENESS_MS = 500;

/** A Position fix may be at most 30 000 ms old when it is used. */
export const POSITION_STALENESS_MS = 30_000;

/** A reported accuracy above 100 m is a Coarse location (Req 7.4). */
export const COARSE_LOCATION_LIMIT_M = 100;

/** Time to wait for the first orientation sample after a start: 3000 ms (Req 11.5). */
export const LISTENING_TIMEOUT_MS = 3000;

/** Time to wait for a position after a start: 30 000 ms (Req 7.6). */
export const POSITION_TIMEOUT_MS = 30_000;

/** A Yaw reference may be used for 60 000 ms after it was established (Req 5.12). */
export const YAW_REFERENCE_MAX_AGE_MS = 60_000;

/** 1-sigma of a Magnetic heading or an Absolute-frame azimuth before Declination: 2°. */
export const HEADING_SIGMA_RAD = 2 * RAD_PER_DEG;

/** The reported geolocation accuracy is taken as the 1-sigma (Req 7.3). */
export const POSITION_CONFIDENCE_SCALE = 1;

/** A Sample history keeps Orientation samples for 5000 ms (Req 14.2). */
export const SAMPLE_RETENTION_MS = 5000;

/**
 * A Sample history keeps Frame reset events for 120 000 ms (Req 14.2). This must be at least the
 * Yaw reference maximum age plus the Sighting window length (here 61 000 ms), so that every Frame
 * reset that could invalidate a usable Yaw reference is still held (Req 14.3).
 */
export const FRAME_RESET_RETENTION_MS = 120_000;

/** An altitude calibration: an offset added to measured altitudes, and the 1-sigma left after it. */
export interface AltitudeCalibration {
  readonly offsetRad: number;
  readonly sigmaRad: number;
}

/**
 * The calibration to use until one is measured (Req 9.2): no offset, and a 1-sigma of 3.5°, which
 * covers the 3.3° iOS bias the probe found and could not explain (math-conventions).
 */
export const UNCALIBRATED_ALTITUDE: AltitudeCalibration = Object.freeze({
  offsetRad: 0,
  sigmaRad: 3.5 * RAD_PER_DEG,
});
