import { describe, expect, it } from 'vitest';
import {
  COARSE_LOCATION_LIMIT_M,
  FRAME_RESET_RETENTION_MS,
  SIGHTING_WINDOW_LENGTH_MS,
  YAW_REFERENCE_MAX_AGE_MS,
} from '@alidade/sensors';
import * as defaults from '../../defaults';
import {
  checkSessionParameters,
  defaultSessionParameters,
  type SessionParameters,
} from './parameters';

function withField(field: string, value: unknown): SessionParameters {
  return { ...defaultSessionParameters(), [field]: value };
}

describe('defaultSessionParameters (Req 19.2, 19.3)', () => {
  it('is built from the constants of Req 19.1 and Sensors defaults', () => {
    const p = defaultSessionParameters();
    expect(p.readoutIntervalMs).toBe(defaults.READOUT_INTERVAL_MS);
    expect(p.steadyBelowRad).toBe(defaults.STEADY_BELOW_RAD);
    expect(p.unsteadyAboveRad).toBe(defaults.UNSTEADY_ABOVE_RAD);
    expect(p.windowLengthMs).toBe(SIGHTING_WINDOW_LENGTH_MS);
    expect(p.coarseLocationLimitM).toBe(COARSE_LOCATION_LIMIT_M);
    expect(p.yawReferenceMaxAgeMs).toBe(YAW_REFERENCE_MAX_AGE_MS);
    expect(p.frameResetRetentionMs).toBe(FRAME_RESET_RETENTION_MS);
    expect(p.altitudeCalibration.offsetRad).toBe(0);
    expect(checkSessionParameters(p)).toEqual({ ok: true, value: p });
  });

  it('has no calibration and no tapSigmaPx field (Req 19.3)', () => {
    const keys = Object.keys(defaultSessionParameters());
    expect(keys).not.toContain('calibration');
    expect(keys).not.toContain('cameraCalibration');
    expect(keys).not.toContain('tapSigmaPx');
    expect(keys.filter((k) => /calib|tap|fov/i.test(k))).toEqual(['altitudeCalibration']);
  });

  it('returns a new record each time', () => {
    expect(defaultSessionParameters()).not.toBe(defaultSessionParameters());
    expect(defaultSessionParameters().altitudeCalibration).not.toBe(
      defaultSessionParameters().altitudeCalibration,
    );
  });
});

describe('checkSessionParameters (Req 19.4)', () => {
  const POSITIVE_FIELDS = [
    'windowLengthMs',
    'sampleStalenessMs',
    'positionStalenessMs',
    'coarseLocationLimitM',
    'yawReferenceMaxAgeMs',
    'sampleRetentionMs',
    'frameResetRetentionMs',
    'readoutIntervalMs',
    'steadyBelowRad',
    'unsteadyAboveRad',
    'maxMarkAltitudeRad',
  ];

  it.each(POSITIVE_FIELDS)('names %s for NaN, infinity, zero and a negative value', (field) => {
    for (const bad of [Number.NaN, Infinity, -Infinity, 0, -1]) {
      expect(checkSessionParameters(withField(field, bad))).toEqual({
        ok: false,
        reason: 'invalid_number',
        field,
      });
    }
  });

  it('names the sample count unless it is an integer of at least 1', () => {
    for (const bad of [0, 1.5, Number.NaN, Infinity, -2]) {
      expect(checkSessionParameters(withField('minSampleCount', bad))).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'minSampleCount',
      });
    }
    expect(checkSessionParameters(withField('minSampleCount', 1)).ok).toBe(true);
  });

  it('refuses a readout interval under 1 ms', () => {
    expect(checkSessionParameters(withField('readoutIntervalMs', 0.999))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'readoutIntervalMs',
    });
    expect(checkSessionParameters(withField('readoutIntervalMs', 1)).ok).toBe(true);
  });

  it('accepts a zero heading sigma and a zero screen-angle tolerance but not a negative one', () => {
    expect(checkSessionParameters(withField('headingSigmaRad', 0)).ok).toBe(true);
    expect(checkSessionParameters(withField('screenAngleToleranceRad', 0)).ok).toBe(true);
    for (const field of ['headingSigmaRad', 'screenAngleToleranceRad']) {
      expect(checkSessionParameters(withField(field, -1e-12)).ok).toBe(false);
      expect(checkSessionParameters(withField(field, Number.NaN)).ok).toBe(false);
    }
  });

  it('names the altitude calibration and its parts', () => {
    expect(checkSessionParameters(withField('altitudeCalibration', null))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'altitudeCalibration',
    });
    expect(
      checkSessionParameters(
        withField('altitudeCalibration', { offsetRad: Number.NaN, sigmaRad: 1 }),
      ),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'altitudeCalibration.offsetRad' });
    expect(
      checkSessionParameters(withField('altitudeCalibration', { offsetRad: 0, sigmaRad: -1 })),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'altitudeCalibration.sigmaRad' });
  });

  it('enforces the Frame reset retention rule at its boundary', () => {
    const need = YAW_REFERENCE_MAX_AGE_MS + SIGHTING_WINDOW_LENGTH_MS;
    expect(checkSessionParameters(withField('frameResetRetentionMs', need)).ok).toBe(true);
    expect(checkSessionParameters(withField('frameResetRetentionMs', need - 1))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'frameResetRetentionMs',
    });
    // Raising the window or the age without raising the retention breaks the rule.
    expect(checkSessionParameters(withField('windowLengthMs', 60_001)).ok).toBe(false);
    expect(checkSessionParameters(withField('yawReferenceMaxAgeMs', 119_500)).ok).toBe(false);
  });

  it('does not throw on a missing field', () => {
    const p = { ...defaultSessionParameters() } as Record<string, unknown>;
    delete p.windowLengthMs;
    expect(checkSessionParameters(p as unknown as SessionParameters).ok).toBe(false);
  });
});
