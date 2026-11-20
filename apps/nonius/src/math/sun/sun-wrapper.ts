// The Sun wrapper (Req 3, design D3, §6.1): the one module that imports `astronomy-engine`.
//
// Time goes to the library as UT days since J2000, by arithmetic and never through `Date`, so
// that UTC stands for UT1 (an error under 0.9 s, under 0.23′ of GHA); the library's own model of
// TT is used. The Sun is geocentric and has aberration, referred to the true equator and equinox
// of date; GHA is the apparent sidereal time less the right ascension. The library's refraction
// and horizon functions are not used.

import { wrapPi, wrapTwoPi, type Position } from '@alidade/core';
import {
  AstroTime,
  Body,
  e_tilt,
  EquatorFromVector,
  GeoVector,
  RotateVector,
  Rotation_EQJ_EQD,
  SiderealTime,
} from 'astronomy-engine';
import { err, ok, type NoniusFailure, type NoniusResult } from '../../result';
import { DEG_TO_RAD, HOURS_TO_DEG } from '../degrees';
import { checkParameters, type NoniusParameters } from '../parameters';

/** 2000-01-01T12:00Z, the epoch J2000, in milliseconds since the Unix epoch. */
const J2000_UTC_MS = 946_728_000_000;
const MS_PER_DAY = 86_400_000;
/** Seconds of the equation of the equinoxes per hour of sidereal time. */
const SECONDS_PER_HOUR = 3600;

export interface SunPosition {
  /** The Sun's declination (angle from the celestial equator), true equator of date. */
  readonly sunDeclinationRad: number;
  /** Greenwich hour angle, westward from the Greenwich meridian, in [0, 2π). */
  readonly ghaRad: number;
}

/** The failure of the wrapper: a time outside the range, or a failure of the library. */
function unsupported(field: string): NoniusFailure {
  return err('sight_time_unsupported', { field });
}

/** The range check of Req 3.2, parameters first. */
function checkTime(timeUtcMs: number, params: NoniusParameters): NoniusFailure | null {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (
    !Number.isFinite(timeUtcMs) ||
    timeUtcMs < params.sunModelStartUtcMs ||
    timeUtcMs >= params.sunModelEndUtcMs
  ) {
    return unsupported('timeUtcMs');
  }
  return null;
}

function astroTime(timeUtcMs: number): AstroTime {
  return new AstroTime((timeUtcMs - J2000_UTC_MS) / MS_PER_DAY);
}

/** The Sun's declination and Greenwich hour angle at a UTC time (Req 3.1). */
export function sunPosition(
  timeUtcMs: number,
  params: NoniusParameters,
): NoniusResult<SunPosition> {
  const refused = checkTime(timeUtcMs, params);
  if (refused !== null) return refused;
  try {
    const t = astroTime(timeUtcMs);
    const equatorial = EquatorFromVector(
      RotateVector(Rotation_EQJ_EQD(t), GeoVector(Body.Sun, t, true)),
    );
    const sunDeclinationRad = equatorial.dec * DEG_TO_RAD;
    if (!Number.isFinite(sunDeclinationRad)) return unsupported('sunDeclinationRad');
    const apparentHours = SiderealTime(t);
    const gha = wrapTwoPi(HOURS_TO_DEG * DEG_TO_RAD * (apparentHours - equatorial.ra));
    if (!gha.ok) return unsupported('ghaRad');
    return ok({ sunDeclinationRad, ghaRad: gha.value });
  } catch {
    return unsupported('timeUtcMs');
  }
}

/** The place where the Sun is overhead at a UTC time: `(δ, −GHA)` (math-conventions, Celestial). */
export function subsolarPoint(timeUtcMs: number, params: NoniusParameters): NoniusResult<Position> {
  const sun = sunPosition(timeUtcMs, params);
  if (!sun.ok) return sun;
  const lonRad = wrapPi(-sun.value.ghaRad);
  if (!lonRad.ok) return unsupported('ghaRad');
  return ok({ latRad: sun.value.sunDeclinationRad, lonRad: lonRad.value });
}

/** Greenwich apparent sidereal time, in [0, 2π) of rotation (24 h = 2π). */
export function greenwichSiderealTimeRad(
  timeUtcMs: number,
  params: NoniusParameters,
): NoniusResult<number> {
  const refused = checkTime(timeUtcMs, params);
  if (refused !== null) return refused;
  try {
    const rad = wrapTwoPi(HOURS_TO_DEG * DEG_TO_RAD * SiderealTime(astroTime(timeUtcMs)));
    return rad.ok ? ok(rad.value) : unsupported('siderealTimeRad');
  } catch {
    return unsupported('timeUtcMs');
  }
}

/**
 * Greenwich mean sidereal time, in [0, 2π): the apparent sidereal time less the equation of the
 * equinoxes, which the library gives in seconds of time.
 */
export function greenwichMeanSiderealTimeRad(
  timeUtcMs: number,
  params: NoniusParameters,
): NoniusResult<number> {
  const refused = checkTime(timeUtcMs, params);
  if (refused !== null) return refused;
  try {
    const t = astroTime(timeUtcMs);
    const meanHours = SiderealTime(t) - e_tilt(t).ee / SECONDS_PER_HOUR;
    const rad = wrapTwoPi(HOURS_TO_DEG * DEG_TO_RAD * meanHours);
    return rad.ok ? ok(rad.value) : unsupported('siderealTimeRad');
  } catch {
    return unsupported('timeUtcMs');
  }
}
