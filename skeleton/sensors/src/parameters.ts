// Validation of the tunable parameters (Req 10.3). Each validator returns the value or an
// `invalid_number` failure naming the parameter, so that a caller sees which value was wrong.

import { err, ok, type SensorResult } from './sensor-result';

/** A duration in milliseconds: finite and not negative. */
export function checkDurationMs(value: number, field: string): SensorResult<number> {
  return Number.isFinite(value) && value >= 0 ? ok(value) : err('invalid_number', { field });
}

/** A Sighting window length: finite and positive. */
export function checkWindowLengthMs(value: number, field: string): SensorResult<number> {
  return Number.isFinite(value) && value > 0 ? ok(value) : err('invalid_number', { field });
}

/** A sample count: an integer of at least 1. */
export function checkSampleCount(value: number, field: string): SensorResult<number> {
  return Number.isInteger(value) && value >= 1 ? ok(value) : err('invalid_number', { field });
}

/** A 1-sigma (radians or metres): finite and not negative. */
export function checkSigma(value: number, field: string): SensorResult<number> {
  return Number.isFinite(value) && value >= 0 ? ok(value) : err('invalid_number', { field });
}

/** A confidence scale: finite and positive. */
export function checkScale(value: number, field: string): SensorResult<number> {
  return Number.isFinite(value) && value > 0 ? ok(value) : err('invalid_number', { field });
}

/** A limit in metres: finite and positive. */
export function checkLimitM(value: number, field: string): SensorResult<number> {
  return Number.isFinite(value) && value > 0 ? ok(value) : err('invalid_number', { field });
}

/** A time instant in milliseconds since the Unix epoch: finite. */
export function checkTimeUtcMs(value: number, field: string): SensorResult<number> {
  return Number.isFinite(value) ? ok(value) : err('invalid_number', { field });
}
