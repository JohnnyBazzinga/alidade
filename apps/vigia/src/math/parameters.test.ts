import { describe, expect, it } from 'vitest';
import * as defaults from '../defaults';
import { CODE_LENGTH } from './code/sighting-code';
import {
  checkParameters,
  defaultParameters,
  LEAST_LINK_LENGTH_CHARS,
  type VigiaParameters,
} from './parameters';
import { neighbours } from '../test-support/hostile';

/** The fields of VigiaParameters in the order of design §6: the order checkParameters reports in. */
const FIELDS = [
  'maxIncidentAgeMs',
  'incidentRetentionMs',
  'clockSkewToleranceMs',
  'maxSightingsPerIncident',
  'plausibleRangeM',
  'longEllipseRatio',
  'fairEllipseRatio',
  'maxCodeLengthChars',
  'maxLinkLengthChars',
  'maxEmergencyTextChars',
  'windGridDeg',
  'maxWindAgeMs',
  'maxResponseBytes',
  'requestTimeoutMs',
  'simulationTapSigmaPx',
  'adviceMinDistanceM',
  'expiryCheckIntervalMs',
] as const satisfies readonly (keyof VigiaParameters)[];

/** The fields that are counts: an integer of at least 1 (design §7.20). */
const COUNTS = [
  'maxSightingsPerIncident',
  'maxCodeLengthChars',
  'maxLinkLengthChars',
  'maxEmergencyTextChars',
  'maxResponseBytes',
] as const;

const DEFAULTS = defaultParameters();
const withField = (field: keyof VigiaParameters, value: number): VigiaParameters => ({
  ...DEFAULTS,
  [field]: value,
});
const invalid = (field: string) => ({ ok: false, reason: 'invalid_number', field });

describe('defaultParameters (Req 19.1, 19.2)', () => {
  it('assembles the constants of defaults.ts into one record, field by field', () => {
    expect(DEFAULTS).toEqual({
      maxIncidentAgeMs: defaults.MAX_INCIDENT_AGE_MS,
      incidentRetentionMs: defaults.INCIDENT_RETENTION_MS,
      clockSkewToleranceMs: defaults.CLOCK_SKEW_TOLERANCE_MS,
      maxSightingsPerIncident: defaults.MAX_SIGHTINGS_PER_INCIDENT,
      plausibleRangeM: defaults.PLAUSIBLE_RANGE_M,
      longEllipseRatio: defaults.LONG_ELLIPSE_RATIO,
      fairEllipseRatio: defaults.FAIR_ELLIPSE_RATIO,
      maxCodeLengthChars: defaults.MAX_CODE_LENGTH_CHARS,
      maxLinkLengthChars: defaults.MAX_LINK_LENGTH_CHARS,
      maxEmergencyTextChars: defaults.MAX_EMERGENCY_TEXT_CHARS,
      windGridDeg: defaults.WIND_GRID_DEG,
      maxWindAgeMs: defaults.MAX_WIND_AGE_MS,
      maxResponseBytes: defaults.MAX_RESPONSE_BYTES,
      requestTimeoutMs: defaults.REQUEST_TIMEOUT_MS,
      simulationTapSigmaPx: defaults.SIMULATION_TAP_SIGMA_PX,
      adviceMinDistanceM: defaults.ADVICE_MIN_DISTANCE_M,
      expiryCheckIntervalMs: defaults.EXPIRY_CHECK_INTERVAL_MS,
    });
    expect(Object.keys(DEFAULTS)).toEqual([...FIELDS]);
  });

  it('is frozen, and each call gives a record equal to the last', () => {
    expect(Object.isFrozen(DEFAULTS)).toBe(true);
    expect(defaultParameters()).toEqual(DEFAULTS);
  });

  it('passes checkParameters, and is returned as it is', () => {
    expect(checkParameters(DEFAULTS)).toEqual({ ok: true, value: DEFAULTS });
  });
});

describe('LEAST_LINK_LENGTH_CHARS (design §7.20)', () => {
  it('is a code and the shortest page address with its #, so the two modules agree', () => {
    expect(LEAST_LINK_LENGTH_CHARS).toBe(CODE_LENGTH + 'https://a.b/#'.length);
    expect(LEAST_LINK_LENGTH_CHARS).toBe(63);
  });

  it('is the length checkParameters compares maxLinkLengthChars with, and the generated fields are in the record order', () => {
    expect(Object.keys(DEFAULTS)).toEqual([...FIELDS]);
  });
});

describe('checkParameters: one field at a time (Req 19.3)', () => {
  for (const field of FIELDS) {
    it(`${field}: NaN, infinities, zero and negative values are invalid_number naming it`, () => {
      for (const bad of [Number.NaN, Infinity, -Infinity, 0, -0, -1, -Number.MIN_VALUE]) {
        expect(checkParameters(withField(field, bad)), `${field} = ${bad}`).toEqual(invalid(field));
      }
    });
  }

  for (const field of COUNTS) {
    it(`${field} is a count: an integer of at least 1, at and either side of the limit`, () => {
      for (const bad of [0, 0.5, 0.999999, 1.5, 2.5]) {
        expect(checkParameters(withField(field, bad)), `${field} = ${bad}`).toEqual(invalid(field));
      }
      // 1 is the least count; the two consistency limits on lengths are tested below.
      if (
        field === 'maxSightingsPerIncident' ||
        field === 'maxCodeLengthChars' ||
        field === 'maxResponseBytes'
      ) {
        expect(checkParameters(withField(field, 1)).ok).toBe(true);
      }
    });
  }

  it('accepts a duration or a length that is positive but not an integer', () => {
    expect(checkParameters(withField('maxIncidentAgeMs', 1_800_000.5)).ok).toBe(true);
    expect(checkParameters(withField('windGridDeg', Number.MIN_VALUE)).ok).toBe(true);
    expect(checkParameters(withField('plausibleRangeM', 0.001)).ok).toBe(true);
  });
});

describe('checkParameters: the consistency of Req 19.3 and design §7.20, at and either side of each limit', () => {
  it('incidentRetentionMs must be longer than maxIncidentAgeMs', () => {
    const age = DEFAULTS.maxIncidentAgeMs;
    expect(checkParameters(withField('incidentRetentionMs', age - 1))).toEqual(
      invalid('incidentRetentionMs'),
    );
    expect(checkParameters(withField('incidentRetentionMs', age))).toEqual(
      invalid('incidentRetentionMs'),
    );
    expect(checkParameters(withField('incidentRetentionMs', age + 1)).ok).toBe(true);
  });

  it('fairEllipseRatio must be above 1', () => {
    const [one, above, below] = neighbours(1);
    expect(checkParameters(withField('fairEllipseRatio', below ?? 0))).toEqual(
      invalid('fairEllipseRatio'),
    );
    expect(checkParameters(withField('fairEllipseRatio', one ?? 0))).toEqual(
      invalid('fairEllipseRatio'),
    );
    expect(checkParameters(withField('fairEllipseRatio', above ?? 0)).ok).toBe(true);
  });

  it('longEllipseRatio must be above fairEllipseRatio', () => {
    const [fair, above, below] = neighbours(DEFAULTS.fairEllipseRatio);
    expect(checkParameters(withField('longEllipseRatio', below ?? 0))).toEqual(
      invalid('longEllipseRatio'),
    );
    expect(checkParameters(withField('longEllipseRatio', fair ?? 0))).toEqual(
      invalid('longEllipseRatio'),
    );
    expect(checkParameters(withField('longEllipseRatio', above ?? 0)).ok).toBe(true);
  });

  it('maxLinkLengthChars must hold a code of 50 symbols and the shortest page address with its #: 63', () => {
    expect(checkParameters(withField('maxLinkLengthChars', 62))).toEqual(
      invalid('maxLinkLengthChars'),
    );
    expect(checkParameters(withField('maxLinkLengthChars', 63)).ok).toBe(true);
    expect(checkParameters(withField('maxLinkLengthChars', 64)).ok).toBe(true);
  });

  it('maxEmergencyTextChars must hold the worst case of the Emergency text: 896 (Req 14.11, 19.1)', () => {
    expect(checkParameters(withField('maxEmergencyTextChars', 895))).toEqual(
      invalid('maxEmergencyTextChars'),
    );
    expect(checkParameters(withField('maxEmergencyTextChars', 896)).ok).toBe(true);
    expect(checkParameters(withField('maxEmergencyTextChars', 897)).ok).toBe(true);
  });
});

describe('checkParameters: which invalid field is named first (Req 19.3)', () => {
  it('names the earlier field of design §6 when two fields are invalid', () => {
    const p = {
      ...DEFAULTS,
      requestTimeoutMs: -1,
      maxIncidentAgeMs: Number.NaN,
      plausibleRangeM: 0,
    };
    expect(checkParameters(p)).toEqual(invalid('maxIncidentAgeMs'));
  });

  it('names a field that is not finite or not positive before any consistency failure', () => {
    const p = { ...DEFAULTS, incidentRetentionMs: 1, requestTimeoutMs: Number.NaN };
    expect(checkParameters(p)).toEqual(invalid('requestTimeoutMs'));
  });

  it('names the consistency failures in the order of design §7.20', () => {
    const everything = {
      ...DEFAULTS,
      incidentRetentionMs: 1,
      fairEllipseRatio: 1,
      longEllipseRatio: 1,
      maxLinkLengthChars: 10,
      maxEmergencyTextChars: 10,
    };
    expect(checkParameters(everything)).toEqual(invalid('incidentRetentionMs'));
    const second = { ...everything, incidentRetentionMs: DEFAULTS.incidentRetentionMs };
    expect(checkParameters(second)).toEqual(invalid('fairEllipseRatio'));
    expect(checkParameters({ ...second, fairEllipseRatio: 1.5 })).toEqual(
      invalid('longEllipseRatio'),
    );
    expect(checkParameters({ ...second, fairEllipseRatio: 1.5, longEllipseRatio: 3 })).toEqual(
      invalid('maxLinkLengthChars'),
    );
    expect(
      checkParameters({
        ...second,
        fairEllipseRatio: 1.5,
        longEllipseRatio: 3,
        maxLinkLengthChars: 160,
      }),
    ).toEqual(invalid('maxEmergencyTextChars'));
  });
});
