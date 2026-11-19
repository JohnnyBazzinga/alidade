// The fixture of the words and the Emergency texts (fixtures/emergency-texts.json), read once for
// the tests, and the Fix and the Assessment each of its cases describes (test support, not
// exported). The fixture is read-only.

import type { Fix, Position } from '@alidade/core';
import type { Assessment } from '../math/assessment/assess';
import { fromDeg } from '../math/degrees';
import type { FixWords } from '../math/fix/fix-words';
import { entryOfBearing } from './geometry-fixtures';
import { fixOf } from './generators';
import { bearingOf } from './incident-fixtures';

export interface WordsCase {
  readonly name: string;
  readonly fix: {
    readonly latDeg: number;
    readonly lonDeg: number;
    readonly semiMajorM: number;
    readonly semiMinorM: number;
    readonly azimuthDeg: number;
    readonly warnings: readonly ('poor_geometry' | 'outliers_excluded')[];
    readonly excludedIds: readonly string[];
  };
  readonly used: readonly {
    readonly latDeg: number;
    readonly lonDeg: number;
    readonly timeUtcMs: number;
  }[];
  readonly setAsideCount: number;
  readonly fixWords: FixWords;
  readonly emergency: EmergencyTexts;
}

export interface EmergencyTexts {
  readonly device: string;
  readonly deviceWithOwnPosition: string;
  readonly simulation: string;
}

export interface WordsFixture {
  readonly nowUtcMs: number;
  readonly fixes: readonly WordsCase[];
  readonly ownPosition: {
    readonly latDeg: number;
    readonly lonDeg: number;
    readonly accuracyM: number;
  };
  readonly oneSighting: EmergencyTexts & {
    readonly bearing: {
      readonly latDeg: number;
      readonly lonDeg: number;
      readonly timeUtcMs: number;
      readonly azimuthDeg: number;
      readonly azimuthSigmaDeg: number;
      readonly positionAccuracyM: number;
    };
  };
  readonly failedEllipse: {
    readonly semiMajorM: number;
    readonly semiMinorM: number;
    readonly failure: { readonly ok: false; readonly reason: string };
  };
}

export const WORDS_FIXTURE: WordsFixture = JSON.parse(
  Object.values(
    import.meta.glob<string>('../../fixtures/emergency-texts.json', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  )[0] ?? 'null',
) as WordsFixture;

export const rad = (angleDeg: number): number => {
  const r = fromDeg(angleDeg);
  if (!r.ok) throw new Error('fromDeg');
  return r.value;
};

/** The Fix of a case. */
export function fixOfCase(c: WordsCase): Fix {
  const fix = fixOf(
    { latRad: rad(c.fix.latDeg), lonRad: rad(c.fix.lonDeg) },
    {
      semiMajorM: c.fix.semiMajorM,
      semiMinorM: c.fix.semiMinorM,
      azimuthRad: rad(c.fix.azimuthDeg),
    },
    c.fix.warnings,
  );
  return { ...fix, excludedIds: c.fix.excludedIds };
}

/** The Assessment of a case: its used Sightings, as many set aside as it says (hidden), and its Fix. */
export function assessmentOfCase(c: WordsCase): Assessment {
  const used = c.used.map((u, i) =>
    entryOfBearing(
      i + 1,
      bearingOf(i + 1, {
        observer: { latRad: rad(u.latDeg), lonRad: rad(u.lonDeg) },
        timeUtcMs: u.timeUtcMs,
      }),
    ),
  );
  const setAside = Array.from({ length: c.setAsideCount }, (_, i) => ({
    entry: entryOfBearing(20 + i, bearingOf(20 + i), true),
    cause: 'hidden_by_user' as const,
  }));
  const n = used.length;
  return {
    used,
    setAside,
    fix: { ok: true, value: fixOfCase(c) },
    checkLevel: n === 2 ? 'two' : n === 3 ? 'three' : 'four_or_more',
    disagreement: 'none',
  };
}

/** The own position of the fixture, as the Emergency text takes it. */
export function ownPositionOfFixture(): {
  readonly position: Position;
  readonly accuracyM: number;
} {
  const own = WORDS_FIXTURE.ownPosition;
  return {
    position: { latRad: rad(own.latDeg), lonRad: rad(own.lonDeg) },
    accuracyM: own.accuracyM,
  };
}

/** The Assessment of the one-Sighting case: one used Sighting, no Fix. */
export function oneSightingAssessment(): Assessment {
  const b = WORDS_FIXTURE.oneSighting.bearing;
  const entry = entryOfBearing(
    1,
    bearingOf(1, {
      observer: { latRad: rad(b.latDeg), lonRad: rad(b.lonDeg) },
      timeUtcMs: b.timeUtcMs,
      azimuthRad: rad(b.azimuthDeg),
      azimuthSigmaRad: rad(b.azimuthSigmaDeg),
      positionAccuracyM: b.positionAccuracyM,
    }),
  );
  return { used: [entry], setAside: [], fix: null, checkLevel: 'one', disagreement: 'none' };
}
