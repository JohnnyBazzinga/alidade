// The named constants of Req 19.1 that the first release builds. Each says its unit, the reason
// for its value and its basis (Req 19.4): measured, a threshold of the skeleton, or judgement.
// `defaults.test.ts` reads these comments. All are the lead's proposals (open question U4, decided
// "as proposed") and none is measured: Device check V8 may revise them. The thresholds of the
// skeleton that Vigia's words quote (Core's 3.5 outlier limit and 20 degree poor-geometry limit)
// are not here: they are Core's exports and Vigia holds no copy. The hotspot constants come with
// the hotspot Overlay (second release).
//
// `defaultParameters()` (math/parameters.ts) assembles them into one record; nothing else reads
// them. Degrees appear in the name of one constant, `WIND_GRID_DEG`, because it is the grid of an
// outgoing request.

/**
 * The age of the newest used Sighting beyond which an older one is set aside: a fire's smoke
 * column stays where it is for tens of minutes and moves afterwards, so an older bearing may
 * point at where the smoke was. Unit: ms. Basis: judgement (30 minutes).
 */
export const MAX_INCIDENT_AGE_MS = 30 * 60_000;

/**
 * How long an Incident is kept on the phone after its newest Sighting (or its creation, when it
 * has none), so that a lock screen or a discarded page loses nothing in a day and the positions
 * of other people do not stay for ever. Unit: ms. Basis: judgement (24 hours).
 */
export const INCIDENT_RETENTION_MS = 24 * 3_600_000;

/**
 * How far into the future the time of a Sighting may lie before it is set aside as implausible:
 * the clocks of two phones differ by seconds when set by the network and by minutes when not.
 * Unit: ms. Basis: judgement (2 minutes).
 */
export const CLOCK_SKEW_TOLERANCE_MS = 2 * 60_000;

/**
 * The most Sightings one Incident holds: more than a few observers of one smoke column is
 * unlikely, and a bound keeps the list readable and the solve fast.
 * Unit: count. Basis: judgement (32).
 */
export const MAX_SIGHTINGS_PER_INCIDENT = 32;

/**
 * The distance from the nearest used observer beyond which a Fix is reported as farther than a
 * phone sighting can place (a warning, not a refusal): the compass error of several degrees
 * grows into kilometres over such a range. Unit: m. Basis: judgement (50 km).
 */
export const PLAUSIBLE_RANGE_M = 50_000;

/**
 * The ratio of the semi-major to the semi-minor axis of a Fix's Ellipse from which the geometry
 * is called poor: a long thin ellipse says the smoke could be much nearer or farther than it
 * shows. Unit: ratio. Basis: judgement (3).
 */
export const LONG_ELLIPSE_RATIO = 3;

/**
 * The ratio from which the geometry is called fair and not good: below it the ellipse is
 * close to round and the lines cross at a good angle. Unit: ratio. Basis: judgement (1.5).
 */
export const FAIR_ELLIPSE_RATIO = 1.5;

/**
 * The longest text the decoder looks at before it parses anything: a code has 50 symbols and a
 * pasted message with a link and some words is far shorter than this, while a whole document
 * pasted by mistake is refused at once. Unit: chars. Basis: judgement (2 048).
 */
export const MAX_CODE_LENGTH_CHARS = 2048;

/**
 * The longest Sighting link: a QR code of this length is of a version that a phone's camera
 * reads from a screen at arm's length, and the link still holds a page address of 109
 * characters. Unit: chars. Basis: judgement (160).
 */
export const MAX_LINK_LENGTH_CHARS = 160;

/**
 * The longest Emergency text: short enough to read out to an operator, and long enough for the
 * position, its uncertainty, the basis and the geometry in words (the worst case is 730
 * characters). Unit: chars. Basis: judgement (800).
 */
export const MAX_EMERGENCY_TEXT_CHARS = 800;

/**
 * The nearest to the smoke that the next-sighting advice asks the user to stand: closer than
 * this a phone compass sighting at a column of smoke says little, and the advice would send
 * people into danger. Unit: m. Basis: judgement (300 m).
 */
export const ADVICE_MIN_DISTANCE_M = 300;

/**
 * How often the store checks for Incidents past their retention: a minute is far below the 24
 * hours and costs nothing. Unit: ms. Basis: judgement (60 000 ms).
 */
export const EXPIRY_CHECK_INTERVAL_MS = 60_000;

/**
 * The grid to which the point of a wind request is rounded, so that the request does not reveal
 * a position more finely than the data needs: the wind model's own resolution is about this.
 * Unit: deg. Basis: judgement (0.1 degree, about 11 km).
 */
export const WIND_GRID_DEG = 0.1;

/**
 * The difference between the time a wind reading is valid for and now beyond which it is not
 * shown as current but as a forecast or an old reading. Unit: ms. Basis: judgement (3 hours).
 */
export const MAX_WIND_AGE_MS = 3 * 3_600_000;

/**
 * The most bytes read from the response to a request: the answers of the wind source are small,
 * and an answer far larger is not the answer expected. Unit: bytes. Basis: judgement (1 000 000).
 */
export const MAX_RESPONSE_BYTES = 1_000_000;

/**
 * How long a request waits before it is given up and reported as unavailable: a phone on a weak
 * mobile connection may take seconds, and the app works without the answer.
 * Unit: ms. Basis: judgement (10 seconds).
 */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The 1-sigma of a tap on the frozen image in Simulation mode, so that the reviewer sees the
 * Mark; the tap precision measured on a phone (UI's Device check 8) replaces it when it exists.
 * Unit: px. Basis: judgement (3 CSS pixels, used only in Simulation mode).
 */
export const SIMULATION_TAP_SIGMA_PX = 3;
