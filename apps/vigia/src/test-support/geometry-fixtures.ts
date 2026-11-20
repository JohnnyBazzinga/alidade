// Synthetic geometry for the tests of the assessment, the words and the advice (test support, not
// exported): the posts of the reviewer's scenes (design §10) as offsets in metres from the origin
// `30° N, 40° W`, a target 3 000 m north, and Bearings that point exactly at a Position.

import { initialAzimuthRad, type Bearing, type Position } from '@alidade/core';
import type { Incident, SightingEntry } from '../math/incident/incident-state';
import {
  canonicalOf,
  INCIDENT_ID,
  NOW_UTC_MS,
  offsetFromOrigin,
  sightingIdOf,
} from './incident-fixtures';

/** The posts of the scenes of design §10: east and north offsets in metres from the origin. */
export const POSTS = {
  west: [-800, 0],
  east: [800, 0],
  side: [3100, 3000],
  southwest: [-2500, -500],
  front: [0, 0],
  back: [420, -3000],
} as const;
export type PostName = keyof typeof POSTS;

/** The smoke: 3 000 m north of the origin. */
export const TARGET: Position = offsetFromOrigin(0, 3000);

/** The 1-sigma of the azimuth the design's probe used for its figures: 2.1 degrees. */
export const PROBE_SIGMA_RAD = (2.1 * Math.PI) / 180;

export const postPosition = (post: PostName): Position =>
  offsetFromOrigin(POSTS[post][0], POSTS[post][1]);

/** A Bearing from `observer` that points exactly at `target`, plus `azimuthErrorRad`. */
export function pointingAt(
  id: string,
  observer: Position,
  target: Position,
  azimuthErrorRad = 0,
  change: Partial<Bearing> = {},
): Bearing {
  const azimuth = initialAzimuthRad(observer, target);
  if (!azimuth.ok) throw new Error('initialAzimuthRad failed');
  const twoPi = 2 * Math.PI;
  return {
    id,
    observer,
    positionAccuracyM: 8,
    timeUtcMs: NOW_UTC_MS - 60_000,
    azimuthRad: (((azimuth.value + azimuthErrorRad) % twoPi) + twoPi) % twoPi,
    azimuthSigmaRad: PROBE_SIGMA_RAD,
    ...change,
  };
}

/** An entry whose Sighting is canonical, built from a complete Bearing (`bearing` overrides fields). */
export function entryOfBearing(n: number, bearing: Bearing, hidden = false): SightingEntry {
  const { sighting, code } = canonicalOf(n, INCIDENT_ID, { ...bearing, id: sightingIdOf(n) });
  return { sighting, code, hidden, shared: [] };
}

/** An Incident (created at `createdUtcMs`) holding the given entries, ordered by Sighting id. */
export function incidentOfEntries(
  entries: readonly SightingEntry[],
  createdUtcMs = NOW_UTC_MS - 3_600_000,
): Incident {
  const sorted = [...entries].sort((a, b) =>
    a.sighting.sightingId < b.sighting.sightingId
      ? -1
      : a.sighting.sightingId > b.sighting.sightingId
        ? 1
        : 0,
  );
  return {
    incidentId: INCIDENT_ID,
    createdUtcMs,
    creation: 'created',
    formerIds: [],
    entries: sorted,
    conflicts: [],
  };
}

/** The scene's posts, each pointing at the target, as entries numbered from 1 in the order given. */
export function postsIncident(
  posts: readonly PostName[],
  change: (
    post: PostName,
    index: number,
  ) => { errorRad?: number; bearing?: Partial<Bearing>; hidden?: boolean } = () => ({}),
): Incident {
  return incidentOfEntries(
    posts.map((post, index) => {
      const { errorRad = 0, bearing = {}, hidden = false } = change(post, index);
      const base = pointingAt(sightingIdOf(index + 1), postPosition(post), TARGET, errorRad, {
        timeUtcMs: NOW_UTC_MS - 60_000 * (index + 1),
        ...bearing,
      });
      return entryOfBearing(index + 1, base, hidden);
    }),
  );
}
