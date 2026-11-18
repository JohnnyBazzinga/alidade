// The named constants of Req 19.1. Every function of the Math layer takes its values as
// parameters and never reads these implicitly (Req 19.2); they are here so that an app can start
// from named values and show in its own code which values it chose. Angles are written through
// `fromDeg`, the only place a literal in degrees appears (Req 1.10).

import { fromDeg } from './math/degrees';

/** The least time between two publications of the Live readout: 200 ms. */
export const READOUT_INTERVAL_MS = 200;

/**
 * Steadiness: the Spread at or below this is `steady`: 0.5°.
 *
 * The two thresholds come from the sensor probe of 2026-11-15 on two phones, an iPhone 13 and a
 * Xiaomi: the repeatability of the relative frame was 0.3° to 0.6° and that of the compass 0.75°
 * to 1.7°. They are to be confirmed by the device checks of the specification (Req 19.5).
 */
export const STEADY_BELOW_RAD = fromDeg(0.5);

/**
 * Steadiness: the Spread above this is `unsteady`: 2°. Between the two thresholds it is
 * `settling`. From the same probe on two phones; to be confirmed by the device checks (Req 19.5).
 */
export const UNSTEADY_ABOVE_RAD = fromDeg(2);

/** Vertices of the drawn 95 % ellipse: 72, one every 5°. */
export const ELLIPSE_VERTEX_COUNT = 72;

/** The largest azimuth step between two vertices of a Wedge's arc: 1°. */
export const WEDGE_ARC_STEP_RAD = fromDeg(1);

/** The least size of an interactive control, in CSS pixels. */
export const MIN_TOUCH_TARGET_PX = 48;

/** The height of the Freeze and Capture controls, in CSS pixels. */
export const PRIMARY_CONTROL_HEIGHT_PX = 64;

/** The spacing step and the least gap between neighbouring controls, in CSS pixels. */
export const SPACING_PX = 8;

/** The least contrast ratio of text and information-bearing lines (WCAG AAA). */
export const MIN_CONTRAST_RATIO = 7;

/** The least font size of a readout, in CSS pixels. */
export const MIN_READOUT_FONT_PX = 20;

/** The Map adapter reports `tiles_unavailable` at most once per this interval: 1000 ms. */
export const MAP_ERROR_REPORT_INTERVAL_MS = 1000;

/** The Simulator panel's tick length: 100 ms. */
export const SIMULATOR_TICK_MS = 100;

/**
 * The longest tick the Simulator panel accepts: 60 000 ms (Req 17.5). With the largest speed, 4,
 * one tick is 240 000 ms, under `MAX_SIMULATOR_ADVANCE_MS` (one hour), so a tick is one advance.
 */
export const MAX_PANEL_TICK_MS = 60_000;

/**
 * The longest simulated time the Simulator panel runs: ten years of 365.25 days (Req 17.5). It
 * bounds the panel's clock, so that no state can make it build an unbounded list of advances.
 */
export const MAX_PANEL_ELAPSED_MS = 10 * 365.25 * 86_400_000;

/**
 * A Screen angle within this of 0 counts as 0 (Req 10.2): 1e-9 rad. Not a tolerance of a
 * measurement; it only absorbs the rounding of an angle that was computed, not read.
 */
export const SCREEN_ANGLE_TOLERANCE_RAD = 1e-9;

/** A Mark whose Off-axis ray is steeper than this has no usable azimuth (Req 12.3): 80°. */
export const MAX_MARK_ALTITUDE_RAD = fromDeg(80);

/** An application may draw at most this many layers of its own on the map (Req 15.15): 8. */
export const MAX_APP_LAYERS = 8;

/** One application layer holds at most this many features (Req 15.15): 2 000. */
export const MAX_LAYER_FEATURES = 2000;
