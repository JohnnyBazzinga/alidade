/**
 * Radius of the sphere every distance in this package is measured on, in metres.
 * Source: `math-conventions.md` (the mean Earth radius, 6 371 008.8 m). Core does not export its
 * own; `earth.test.ts` checks that the two are equal (design D23).
 */
export const EARTH_RADIUS_M = 6_371_008.8;
