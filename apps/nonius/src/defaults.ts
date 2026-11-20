// The named constants of Req 14.1. Each says its unit, the reason for its value and its basis
// (measured, published, the skeleton's, or judgement). `defaults.test.ts` reads these comments.
// The thresholds of the skeleton that Nonius's words quote (Core's 3.5 outlier limit, its 20°
// poor-geometry limit and its 95 % scale) are not here: they are Core's exports and Nonius holds
// no copy.
//
// `defaultParameters()` (math/parameters.ts) assembles them into one record; nothing else reads
// them. This is also the one module that reads time (Req 1.5): `defaultClock` and `defaultTimer`.

import type { Timer, TimerHandle } from '@alidade/ui';
import { ARCMIN_TO_RAD, DEG_TO_RAD } from './math/degrees';

/**
 * The first UTC time the Sun wrapper accepts: 2000-01-01T00:00Z. Unit: ms since the Unix epoch.
 * Basis: judgement and the library's tested range; a phone whose clock was reset to 1970 or to
 * 1980 (a GPS epoch) is refused rather than given a Fix thousands of kilometres off.
 */
export const SUN_MODEL_START_UTC_MS = 946_684_800_000;

/**
 * The first UTC time the Sun wrapper refuses at the end: 2050-01-01T00:00Z. Unit: ms since the
 * Unix epoch. Basis: judgement; the published fixture reaches 2049.
 */
export const SUN_MODEL_END_UTC_MS = 2_524_608_000_000;

/**
 * The lowest corrected apparent altitude of a sight. Below it refraction is 10′ or more and near
 * the ground varies by tens of arc-minutes in a way no formula predicts. Unit: rad (5°). Basis:
 * publication and judgement. Cost: around the December solstice no sight is possible north of
 * about 61° N, and around the June solstice south of 61° S.
 */
export const MIN_SIGHT_ALTITUDE_RAD = 5 * DEG_TO_RAD;

/**
 * The highest corrected apparent altitude of a sight: the skeleton's limit for a Mark, the screen
 * cannot be read with the camera within 10° of straight up, and the Circle's radius falls under
 * 1 110 km. Unit: rad (80°). Basis: skeleton and judgement.
 */
export const MAX_SIGHT_ALTITUDE_RAD = 80 * DEG_TO_RAD;

/**
 * The scatter between sights of the Sun that the sample standard deviation of one second does
 * not contain (the probe measured 3.3° ± 0.5° on an iPhone). Unit: rad (0.5°). Basis:
 * measurement, to be revised by Device check D1.
 */
export const AIM_SIGMA_RAD = 0.5 * DEG_TO_RAD;

/**
 * The share of the refraction that is uncertain: refraction scales with pressure over
 * temperature, which from −20 °C to 40 °C and 950 to 1050 hPa ranges from 0.90 to 1.12 of
 * standard. Unit: ratio. Basis: publication (Meeus, chapter 16).
 */
export const REFRACTION_SIGMA_FRACTION = 0.1;

/**
 * How far a measured Sun azimuth may differ from the computed one before a place is contradicted:
 * the compass's 2° heading sigma, the iPhone's 4° jumps, the model's error up to 2.7°, and up to
 * 10° of change of the Sun's azimuth across a Fix that may be 1 000 km off. Unit: rad (30°).
 * Basis: judgement, to be revised by Device check D4.
 */
export const SUN_SIDE_TOLERANCE_RAD = 30 * DEG_TO_RAD;

/**
 * The difference in Cost between two Candidates from which the lower one is chosen: 9 makes the
 * other about 90 times less likely (e^4.5). Unit: dimensionless (Cost). Basis: judgement.
 */
export const CROSSING_COST_MARGIN = 9;

/**
 * The distance below which two Candidates' Fixes are one Fix: far above the solver's convergence
 * of 1e-4 m and far below any ellipse of this app. Unit: m. Basis: judgement.
 */
export const SAME_FIX_DISTANCE_M = 1000;

/**
 * The 95 % semi-major axis beyond which no position is shown: the straight-line approximation
 * behind the ellipse fails across it (Circle radii run from 1 110 km at 80° to 9 450 km at 5°),
 * and the map cannot draw it. Unit: m. Basis: judgement; the coverage test of Req 7.3 is its judge.
 */
export const MAX_FIX_SEMI_MAJOR_95_M = 2_000_000;

/**
 * The distance from its origin within which Core guarantees the Local plane (Core Req 3.3).
 * Unit: m. Basis: the skeleton.
 */
export const PLANE_LIMIT_M = 1_000_000;

/**
 * The distance between two solves below which the re-centred solve has converged: far above the
 * solver's step of 1e-4 m and far below any ellipse. Unit: m. Basis: judgement.
 */
export const RECENTRE_TOLERANCE_M = 1;

/**
 * The most calls of Core's solve in one re-centred solve: the first moves from the Candidate to
 * the solution, the second confirms it, two more allow for a slow case. Unit: count. Basis:
 * judgement.
 */
export const MAX_RECENTRE_ROUNDS = 4;

/**
 * The shift of every altitude used to find how the Fix moves with a shared error: it moves each
 * Circle by about 1.1 km, far above the solver's 1e-4 m and far below the Circles' radii. Unit:
 * rad (0.01°). Basis: judgement.
 */
export const SENSITIVITY_STEP_RAD = 0.01 * DEG_TO_RAD;

/**
 * The largest Index error that is saved: three times the largest offset measured (3.3°) and the
 * range of Sensors' altitude capture; a larger value means a sight was not of the Sun, or the
 * place or the clock is wrong. Unit: rad (10°). Basis: measurement and the skeleton.
 */
export const MAX_INDEX_ERROR_RAD = 10 * DEG_TO_RAD;

/**
 * The age of an Index error after which the words say it should be measured again (it is still
 * used): no measurement yet says how fast a phone's index error drifts. Unit: ms (7 days).
 * Basis: judgement, to be revised by Device check D1.
 */
export const INDEX_ERROR_OLD_MS = 604_800_000;

/**
 * The altitude error of the Sun's computed position that goes into the Index error's sigma: the
 * largest error that the bounds of Req 3.5 allow, hypot(1.0′, 1.5′). Unit: rad (1.8′). Basis:
 * Req 3.5.
 */
export const SUN_ALTITUDE_SIGMA_RAD = 1.8 * ARCMIN_TO_RAD;

/**
 * The most sights of one set, and of one Index error: a sight every half hour over a twelve-hour
 * day, well under Core's leave-one-out bound of 64. Unit: count. Basis: judgement.
 */
export const MAX_SIGHTS = 24;

/**
 * The wait after the latest sight that the rule of thumb gives when there is no Fix. Unit: ms
 * (2 hours). Basis: judgement, reported by its counter test.
 */
export const FIRST_WAIT_MS = 7_200_000;

/**
 * The turn of the Sun's azimuth, at the Fix, that the advice waits for: two Circles crossing at
 * 40° give an ellipse of elongation cot(20°) = 2.7, just under the long ratio. Unit: rad (40°).
 * Basis: judgement.
 */
export const ADVICE_TURN_RAD = 40 * DEG_TO_RAD;

/**
 * The step of the advice's scan: the Sun turns at most about 4° in that time away from the
 * zenith limit. Unit: ms (5 minutes). Basis: judgement.
 */
export const ADVICE_SCAN_STEP_MS = 300_000;

/** How far ahead the advice's scan looks: the rest of any day. Unit: ms (12 hours). Basis: judgement. */
export const ADVICE_SCAN_HORIZON_MS = 43_200_000;

/**
 * The step of the best-time search (the last task group only): the Sun moves 2.5° in a step.
 * Unit: ms (10 minutes). Basis: judgement.
 */
export const BEST_TIME_STEP_MS = 600_000;

/**
 * How far ahead the best-time search looks: 144 hypothetical solves cover every time of day once.
 * Unit: ms (24 hours). Basis: judgement.
 */
export const BEST_TIME_HORIZON_MS = 86_400_000;

/**
 * The ratio of the semi-major to the semi-minor axis from which the geometry is called fair and
 * not good: Vigia's value, so that the two apps' words mean the same. Unit: ratio. Basis:
 * judgement.
 */
export const FAIR_ELLIPSE_RATIO = 1.5;

/**
 * The ratio from which the geometry is called poor: Vigia's value. Unit: ratio. Basis: judgement.
 */
export const LONG_ELLIPSE_RATIO = 3;

/**
 * How far an arc of a Circle reaches on each side of the point nearest the Fix, in units of the
 * 95 % semi-major axis: past the ellipse, so that the crossing is seen. Unit: ratio. Basis:
 * judgement.
 */
export const CIRCLE_ARC_HALF_LENGTH_FACTOR = 2;

/**
 * The angular distance between the vertices of an arc, along the Circle: at most 28 km, smooth at
 * the zooms used. Unit: rad (0.25°). Basis: judgement.
 */
export const CIRCLE_ARC_STEP_RAD = 0.25 * DEG_TO_RAD;

/**
 * The accuracy beyond which a location is refused as coarse: for the Comparison (tens to hundreds
 * of kilometres) a GPS good to 10 km changes nothing but the edge; for the Index error 10 km
 * changes the Sun's altitude by at most 5.4′, which the sigma carries. Unit: m. Basis: judgement.
 */
export const LOCATION_COARSE_LIMIT_M = 10_000;

/**
 * The standard deviation of the tap on the screen in Simulation mode: Vigia's value. Unit: source
 * pixels as UI defines it. Basis: judgement (simulation only).
 */
export const SIMULATION_TAP_SIGMA_PX = 3;

/**
 * The accuracy of the Position fix in the scripts of UI's catalogue, used for the Index error in
 * Simulation mode. Unit: m. Basis: the skeleton (simulation only).
 */
export const SIMULATION_LOCATION_ACCURACY_M = 5;

/** The Clock of the app: UTC milliseconds since the Unix epoch. The one read of the system clock. */
export const defaultClock = (): number => Date.now();

const running = new Map<number, ReturnType<typeof setInterval>>();
let nextHandleId = 1;

/** The Timer of the app, over `setInterval`: the one place that waits. */
export const defaultTimer: Timer = {
  start(callback: () => void, intervalMs: number): TimerHandle {
    const id = nextHandleId;
    nextHandleId += 1;
    running.set(id, setInterval(callback, intervalMs));
    return { id };
  },
  stop(handle: TimerHandle): void {
    const interval = running.get(handle.id);
    if (interval === undefined) return;
    clearInterval(interval);
    running.delete(handle.id);
  },
};
