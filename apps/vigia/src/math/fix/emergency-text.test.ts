import { describe, expect, it } from 'vitest';
import { fixOf } from '../../test-support/generators';
import { ORIGIN, PARAMETERS } from '../../test-support/incident-fixtures';
import {
  assessmentOfCase,
  oneSightingAssessment,
  ownPositionOfFixture,
  WORDS_FIXTURE,
} from '../../test-support/words-fixture';
import type { Assessment } from '../assessment/assess';
import { emergencyText, WORST_EMERGENCY_TEXT_CHARS, type EmergencyInput } from './emergency-text';

const NOW = WORDS_FIXTURE.nowUtcMs;
const input = (
  assessment: Assessment,
  mode: 'device' | 'simulation',
  includeOwnPosition: boolean,
): EmergencyInput => ({
  assessment,
  nowUtcMs: NOW,
  mode,
  ownPosition: ownPositionOfFixture(),
  includeOwnPosition,
});

describe('emergencyText against the fixture (Req 14.1 to 14.3, 14.7, 14.10, design §7.12)', () => {
  for (const c of WORDS_FIXTURE.fixes) {
    it(`gives exactly the texts of the fixture for ${c.name}, in each mode`, () => {
      const a = assessmentOfCase(c);
      expect(emergencyText(input(a, 'device', false), PARAMETERS)).toEqual({
        ok: true,
        value: c.emergency.device,
      });
      expect(emergencyText(input(a, 'device', true), PARAMETERS)).toEqual({
        ok: true,
        value: c.emergency.deviceWithOwnPosition,
      });
      expect(emergencyText(input(a, 'simulation', false), PARAMETERS)).toEqual({
        ok: true,
        value: c.emergency.simulation,
      });
    });
  }

  it('gives exactly the direction-only texts for one Sighting and no Fix (Req 14.2)', () => {
    const one = WORDS_FIXTURE.oneSighting;
    const a = oneSightingAssessment();
    expect(emergencyText(input(a, 'device', false), PARAMETERS)).toEqual({
      ok: true,
      value: one.device,
    });
    expect(emergencyText(input(a, 'device', true), PARAMETERS)).toEqual({
      ok: true,
      value: one.deviceWithOwnPosition,
    });
    expect(emergencyText(input(a, 'simulation', false), PARAMETERS)).toEqual({
      ok: true,
      value: one.simulation,
    });
  });

  it('is the failure of ellipse95 for a Fix whose Ellipse Core refuses', () => {
    const c = WORDS_FIXTURE.fixes[0];
    if (c === undefined) throw new Error('fixture');
    const bad = WORDS_FIXTURE.failedEllipse;
    const fix = fixOf(ORIGIN, {
      semiMajorM: bad.semiMajorM,
      semiMinorM: bad.semiMinorM,
      azimuthRad: 0,
    });
    const a = { ...assessmentOfCase(c), fix: { ok: true as const, value: fix } };
    expect(emergencyText(input(a, 'device', false), PARAMETERS)).toEqual(bad.failure);
  });
});

describe('emergencyText: what it holds and what it never holds (Req 14.3, 14.7)', () => {
  const c = WORDS_FIXTURE.fixes[2];
  if (c === undefined) throw new Error('fixture');

  it('holds no observer position, no Sighting id, no Incident id and no code', () => {
    const a = assessmentOfCase(c);
    for (const mode of ['device', 'simulation'] as const) {
      for (const own of [false, true]) {
        const text = emergencyText(input(a, mode, own), PARAMETERS);
        if (!text.ok) throw new Error('failed');
        for (const used of c.used) {
          expect(text.value).not.toContain(
            `${used.latDeg.toFixed(2)}° N, ${Math.abs(used.lonDeg).toFixed(2)}° W`,
          );
        }
        for (const e of a.used) {
          expect(text.value).not.toContain(e.sighting.sightingId);
          expect(text.value).not.toContain(e.sighting.incidentId);
          expect(text.value).not.toContain(e.code);
        }
      }
    }
  });

  it('holds the own position only when it is switched on and given', () => {
    const a = assessmentOfCase(c);
    const mine = 'My own position:';
    expect(emergencyText(input(a, 'device', false), PARAMETERS)).toMatchObject({ ok: true });
    expect(
      (emergencyText(input(a, 'device', false), PARAMETERS) as { value: string }).value,
    ).not.toContain(mine);
    expect(
      (emergencyText(input(a, 'device', true), PARAMETERS) as { value: string }).value,
    ).toContain(mine);
    const none = emergencyText({ ...input(a, 'device', true), ownPosition: null }, PARAMETERS);
    expect(none).toEqual(emergencyText(input(a, 'device', false), PARAMETERS));
  });

  it('begins with the SIMULATION line in Simulation mode, and never otherwise', () => {
    const a = assessmentOfCase(c);
    const sim = emergencyText(input(a, 'simulation', true), PARAMETERS);
    const dev = emergencyText(input(a, 'device', true), PARAMETERS);
    expect(sim.ok && sim.value.split('\n')[0]).toBe(
      'SIMULATION: synthetic scene, not a real place.',
    );
    expect(dev.ok && dev.value).not.toContain('SIMULATION');
  });

  it('says it calls no one, with the time it was written', () => {
    const text = emergencyText(input(assessmentOfCase(c), 'device', false), PARAMETERS);
    expect(text.ok && text.value.split('\n').at(-1)).toBe(
      'Written at 14:13 UTC. The app that wrote this does not call or notify anyone.',
    );
  });

  it('writes an own position known to 0 m as known to about 10 m, never closer', () => {
    const a = assessmentOfCase(c);
    const exact = {
      ...input(a, 'device', true),
      ownPosition: { ...ownPositionOfFixture(), accuracyM: 0 },
    };
    const text = emergencyText(exact, PARAMETERS);
    expect(text.ok && text.value).toContain(
      'My own position: 30.0010° N, 40.0020° W, known to about 10 m.',
    );
  });
});

describe('emergencyText: the failures', () => {
  const c = WORDS_FIXTURE.fixes[0];
  if (c === undefined) throw new Error('fixture');

  it('is insufficient_observations with no used Sighting', () => {
    const none: Assessment = {
      used: [],
      setAside: [],
      fix: null,
      checkLevel: 'none',
      disagreement: 'none',
    };
    expect(emergencyText(input(none, 'device', false), PARAMETERS)).toEqual({
      ok: false,
      reason: 'insufficient_observations',
    });
  });

  it('is the failure of the solve with two or more used and no Fix (the screen shows its Message)', () => {
    const failed = {
      ...assessmentOfCase(c),
      fix: { ok: false as const, reason: 'singular_geometry' as const },
    };
    expect(emergencyText(input(failed, 'device', false), PARAMETERS)).toEqual({
      ok: false,
      reason: 'singular_geometry',
    });
  });

  it('fails for a time that is not finite, an own position that is not Supported, and a parameter that is not valid', () => {
    const a = assessmentOfCase(c);
    expect(
      emergencyText({ ...input(a, 'device', false), nowUtcMs: Number.NaN }, PARAMETERS),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'nowUtcMs',
    });
    expect(
      emergencyText(
        {
          ...input(a, 'device', true),
          ownPosition: { position: { latRad: 1.57, lonRad: 0 }, accuracyM: 5 },
        },
        PARAMETERS,
      ),
    ).toEqual({ ok: false, reason: 'unsupported_position' });
    expect(
      emergencyText(
        {
          ...input(a, 'device', true),
          ownPosition: { ...ownPositionOfFixture(), accuracyM: Number.NaN },
        },
        PARAMETERS,
      ),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'accuracyM' });
    expect(
      emergencyText(input(a, 'device', false), { ...PARAMETERS, maxEmergencyTextChars: 700 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'maxEmergencyTextChars',
    });
  });
});

describe('the worst case of the Emergency text (design §7.12)', () => {
  // Built from the longest string of each line the template can make: the simulation line, an
  // own position of 4 decimals in the far hemispheres, 32 Sightings of which 30 are set aside
  // (two digits each), lengths written as "over 1000 km", ages of 10 000 days, the longest axis
  // words, the poor geometry sentence and a clock of five characters.
  const pos = '88.9999° S, 179.9999° W';
  const L = 'over 1000 km';
  const worst = [
    'SIMULATION: synthetic scene, not a real place.',
    'Smoke seen by phone compass sightings; not confirmed.',
    `Position: ${pos}, probably within about ${L} (95 %).`,
    `The 95 % area is an ellipse with semi-axes ${L} and ${L}, long axis south-east to north-west (135°).`,
    'Based on 32 sightings (30 set aside); newest 10000 days ago, oldest 10000 days ago.',
    'Geometry: poor. Both of you look along nearly the same line; the smoke could be much nearer or farther than it shows.',
    `My own position: ${pos}, known to about ${L}.`,
    'These positions come from phone compass sightings, which are off by several degrees.',
    'Written at 23:59 UTC. The app that wrote this does not call or notify anyone.',
  ].join('\n');

  it('is 731 characters, the figure the module states, and under the 740 that checkParameters requires', () => {
    expect(worst.length).toBe(731);
    expect(WORST_EMERGENCY_TEXT_CHARS).toBe(worst.length);
    expect(worst.length).toBeLessThanOrEqual(740);
    expect(worst.length).toBeLessThanOrEqual(PARAMETERS.maxEmergencyTextChars);
  });

  it('is never reached by the fixture\u2019s texts', () => {
    for (const c of WORDS_FIXTURE.fixes) {
      for (const text of Object.values(c.emergency))
        expect(text.length).toBeLessThanOrEqual(worst.length);
    }
  });
});
