import { describe, expect, it } from 'vitest';
import { fixOf } from '../../test-support/generators';
import {
  entryOfBearing,
  incidentOfEntries,
  pointingAt,
  TARGET,
} from '../../test-support/geometry-fixtures';
import {
  NOW_UTC_MS,
  offsetFromOrigin,
  ORIGIN,
  PARAMETERS,
  sightingIdOf,
} from '../../test-support/incident-fixtures';
import {
  assessmentOfCase,
  oneSightingAssessment,
  ownPositionOfFixture,
  WORDS_FIXTURE,
} from '../../test-support/words-fixture';
import { assess, type Assessment } from '../assessment/assess';
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

describe('the lead\u2019s incident: three sightings, one 15° off (Req 14.11, 6.11)', () => {
  // Posts at (-800, 0), (800, 0) and (4000, 3500) m from the origin, the target at (0, 3000) m,
  // sigmas of 2°, the second Bearing 15° off. Before the amendment of 2026-11-19 the text read
  // "probably within about 370 m (95 %)… Geometry: good" for a Fix 545 m from the smoke and said
  // nothing of the disagreement. The whole text below was computed outside the code, by the
  // script that recomputes the fixture, from the Fix Core returns for these Bearings.
  const twoDeg = (2 * Math.PI) / 180;
  const posts = [offsetFromOrigin(-800, 0), offsetFromOrigin(800, 0), offsetFromOrigin(4000, 3500)];
  const incident = incidentOfEntries(
    posts.map((observer, index) =>
      entryOfBearing(
        index + 1,
        pointingAt(
          sightingIdOf(index + 1),
          observer,
          TARGET,
          index === 1 ? (15 * Math.PI) / 180 : 0,
          {
            azimuthSigmaRad: twoDeg,
          },
        ),
      ),
    ),
  );

  it('says in the line of the position that the sightings disagree, before any metres, and never probably within', () => {
    const a = assess(incident, NOW_UTC_MS, PARAMETERS);
    if (!a.ok) throw new Error('assess');
    expect(a.value.disagreement).toBe('three_disagree');
    const text = emergencyText(
      {
        assessment: a.value,
        nowUtcMs: NOW_UTC_MS,
        mode: 'device',
        ownPosition: null,
        includeOwnPosition: false,
      },
      PARAMETERS,
    );
    expect(text).toEqual({
      ok: true,
      value:
        'Smoke seen by phone compass sightings; not confirmed.\nPosition: the sightings do not agree, at least one is off, and the area given may not contain the smoke; best fit 30.029° N, 39.995° W, within about 370 m (95 %).\nThe 95 % area is an ellipse with semi-axes 300 m and 210 m, long axis north to south (17°).\nBased on 3 sightings; newest less than a minute ago, oldest less than a minute ago.\nGeometry: good. The lines cross at a good angle.\nThree sightings can show that they disagree, but not which one is off.\nThese positions come from phone compass sightings, which are off by several degrees.\nWritten at 14:13 UTC. The app that wrote this does not call or notify anyone.',
    });
  });
});

describe('the worst case of the Emergency text (design §7.12)', () => {
  // Built from the longest string of each line the template can make: the simulation line, an
  // own position of 4 decimals in the far hemispheres, 30 Sightings set aside (two digits),
  // lengths written as "over 1000 km", ages of 10 000 days, the longest axis words, the poor
  // geometry sentence and a clock of five characters. Since 2026-11-19 (Req 14.11) the count line
  // of two and of three used Sightings, and the position line of sightings that disagree, which
  // only three can give with a Fix: that is the longest.
  const pos = '88.9999° S, 179.9999° W';
  const L = 'over 1000 km';
  const textWith = (positionLine: string, used: number, countLines: readonly string[]) =>
    [
      'SIMULATION: synthetic scene, not a real place.',
      'Smoke seen by phone compass sightings; not confirmed.',
      positionLine,
      `The 95 % area is an ellipse with semi-axes ${L} and ${L}, long axis south-east to north-west (135°).`,
      `Based on ${used} sightings (30 set aside); newest 10000 days ago, oldest 10000 days ago.`,
      'Geometry: poor. Both of you look along nearly the same line; the smoke could be much nearer or farther than it shows.',
      ...countLines,
      `My own position: ${pos}, known to about ${L}.`,
      'These positions come from phone compass sightings, which are off by several degrees.',
      'Written at 23:59 UTC. The app that wrote this does not call or notify anyone.',
    ].join('\n');
  const agreeing = `Position: ${pos}, probably within about ${L} (95 %).`;
  const disagreeing = `Position: the sightings do not agree, at least one is off, and the area given may not contain the smoke; best fit ${pos}, within about ${L} (95 %).`;
  const two = textWith(agreeing, 2, ['Two sightings cannot check each other.']);
  const three = textWith(agreeing, 3, [
    'Three sightings can show that they disagree, but not which one is off.',
  ]);
  const worst = textWith(disagreeing, 3, [
    'Three sightings can show that they disagree, but not which one is off.',
  ]);
  const four = textWith(agreeing, 32, []);

  it('is 896 characters, the figure the module states, and within the 900 of Req 19.1', () => {
    expect([four.length, two.length, three.length, worst.length]).toEqual([731, 769, 801, 896]);
    expect(WORST_EMERGENCY_TEXT_CHARS).toBe(worst.length);
    expect(worst.length).toBeLessThanOrEqual(PARAMETERS.maxEmergencyTextChars);
    expect(PARAMETERS.maxEmergencyTextChars).toBe(900);
  });

  it('is never reached by the fixture\u2019s texts', () => {
    for (const c of WORDS_FIXTURE.fixes) {
      for (const text of Object.values(c.emergency))
        expect(text.length).toBeLessThanOrEqual(worst.length);
    }
  });
});
