// Synthetic scenes for the tests and the README: a fire at a made-up place, seen from posts that
// are placed with Core's own functions. Test support only; not part of the server.

import {
  degToRad,
  destinationPosition,
  initialAzimuthRad,
  radToDeg,
  wrapTwoPi,
  type Position,
} from '@alidade/core';

export function unwrap<T>(
  result:
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string },
): T {
  if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);
  return result.value;
}

export interface Place {
  readonly latDeg: number;
  readonly lonDeg: number;
}

export function positionOf(place: Place): Position {
  return { latRad: unwrap(degToRad(place.latDeg)), lonRad: unwrap(degToRad(place.lonDeg)) };
}

export function placeOf(position: Position): Place {
  return { latDeg: unwrap(radToDeg(position.latRad)), lonDeg: unwrap(radToDeg(position.lonRad)) };
}

/** The fire of the README: the catalogue origin, a made-up place in the open Atlantic. */
export const FIRE: Place = { latDeg: 30, lonDeg: -40 };

export interface Post {
  readonly id: string;
  /** The azimuth, clockwise from true north, from the fire to the post. */
  readonly fromFireDeg: number;
  readonly distanceM: number;
}

export const TIME_UTC_MS = Date.UTC(2026, 7, 15, 14, 30, 0);

export interface BearingArgs {
  id: string;
  observer: Place;
  positionAccuracyM: number;
  timeUtcMs: number;
  azimuthDeg: number;
  azimuthSigmaDeg: number;
}

/** The true bearing from a post to the fire, as the arguments of `fix_from_bearings`. */
export function bearingFrom(fire: Place, post: Post, sigmaDeg: number, errorDeg = 0): BearingArgs {
  const target = positionOf(fire);
  const observer = unwrap(
    destinationPosition(target, unwrap(degToRad(post.fromFireDeg)), post.distanceM),
  );
  const azimuthRad = unwrap(initialAzimuthRad(observer, target));
  const azimuthDeg = unwrap(radToDeg(unwrap(wrapTwoPi(azimuthRad + unwrap(degToRad(errorDeg))))));
  return {
    id: post.id,
    observer: placeOf(observer),
    positionAccuracyM: 5,
    timeUtcMs: TIME_UTC_MS,
    azimuthDeg,
    azimuthSigmaDeg: sigmaDeg,
  };
}

/** The two posts of the worked example: 5 km west and 6 km south of the fire. */
export const TWO_POSTS: readonly Post[] = [
  { id: 'post-west', fromFireDeg: 270, distanceM: 5000 },
  { id: 'post-south', fromFireDeg: 180, distanceM: 6000 },
];

export function fixArgs(
  posts: readonly Post[] = TWO_POSTS,
  sigmaDeg = 1,
  fire: Place = FIRE,
): { bearings: BearingArgs[] } {
  return { bearings: posts.map((post) => bearingFrom(fire, post, sigmaDeg)) };
}
