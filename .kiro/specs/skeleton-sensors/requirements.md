# Requirements Document

## Introduction

`skeleton-sensors` is the package `skeleton/sensors` (`@alidade/sensors`). It turns raw device data into plain data for the rest of the skeleton: the direction the rear camera points (or any ray through the camera image), the device's position with its accuracy, the magnetic declination, and, from a short window of samples, one Bearing observation of `@alidade/core` or one apparent altitude. It keeps the recent samples for the apps (Requirement 14). It also provides a deterministic, seeded simulator behind the same interface as the real sensors, so that every flow runs on a laptop.

Browser sensor APIs are touched only in this package (`tech.md`). It depends on `@alidade/core` and on one pinned World Magnetic Model package, and on nothing else (`structure.md`).

The package has two layers:

- the **Math layer**: pure functions for the device rotation, the camera axis and off-axis rays, frame and reference handling, declination, and the averaging of samples. It reads no clock, no randomness and no browser API, and it is covered by property tests;
- the **Adapters**: thin code that reads the browser APIs and turns their events into plain samples for the Math layer. They are covered by example tests against fake browser objects.

All conventions in `.kiro/steering/math-conventions.md` are binding, including the findings of the sensor probe of 2026-11-15. In particular: the camera azimuth and altitude come from the full device rotation, never from `alpha` or `gamma` alone; on Android the absolute orientation event is used; on iOS the compass only fixes the yaw reference and the relative frame gives the precision; compass headings are magnetic and need declination; and absolute altitude carries an uncertainty that covers the unexplained 3.3° iOS bias until it is calibrated.

Out of scope: React and any user interface, maps, the fix solver, the celestial model, and the computation of the Sun's position. The camera image (`getUserMedia`, freezing a frame, mapping a tap to pixel offsets) belongs to the `skeleton-ui` spec; this package only turns angular offsets in the camera frame into rays (Requirement 3).

The private folder `notes/` holds real locations and is not used. Every fixture in this package is either synthetic or a published reference value (the official World Magnetic Model test values); none holds a recorded location.

## Glossary

- **Sensors**: the `@alidade/sensors` package specified here.
- **Core**: the `@alidade/core` package. **Bearing observation**, **Position**, **Supported position**, **Azimuth**, **Result** and **Reason** are as defined in the sighting-core requirements.
- **Math layer**: the modules of Sensors that are pure functions of their arguments (see Requirement 1).
- **Adapter**: a module of Sensors that reads a browser API (device orientation, geolocation, page visibility, screen orientation, permissions) and produces plain data for the Math layer.
- **Clock**: a function, injected into an Adapter, that returns the current time in milliseconds since the Unix epoch, UTC.
- **Duration**: a length of time in milliseconds, named with the suffix `Ms` (for example `windowLengthMs`), as distinct from a time instant, named with `UtcMs`.
- **Sensor source**: the interface through which the rest of the skeleton receives orientation samples, position fixes and Frame reset events. Both the browser Adapters and the Simulator source implement it.
- **Simulator source**: a Sensor source that generates samples from a seeded script instead of from a device.
- **Raw orientation event**: the plain record of one W3C `DeviceOrientationEvent` as the Adapter receives it: `alpha`, `beta`, `gamma` in degrees (each possibly `null`), the `absolute` flag, which event type it arrived as (`deviceorientation` or `deviceorientationabsolute`), and on iOS `webkitCompassHeading` and `webkitCompassAccuracy` in degrees.
- **Device rotation**: the rotation `R = Rz(alpha) · Rx(beta) · Ry(gamma)` that maps device coordinates to East-North-Up (math-conventions, Frames).
- **Camera axis**: the unit vector, in East-North-Up, of the rear camera's viewing direction, the image under `R` of the device vector `(0, 0, -1)`.
- **Ray offset**: a pair of angles `(rightRad, upRad)` that names a direction in the camera image relative to the Camera axis. The ray's device-frame direction is `(tan rightRad, tan upRad, -1)`, normalised: `rightRad` is the angle of the ray's projection on the device's x-z plane from the `-z` axis, toward `+x` (the right of the screen), and `upRad` that of its projection on the y-z plane, toward `+y` (the top of the screen). These are the image angles of a pinhole camera whose optical axis is the Camera axis.
- **Off-axis ray**: the unit vector, in East-North-Up, of the direction named by a Ray offset under a Device rotation. At the zero offset it is the Camera axis.
- **Camera azimuth**: `wrapTwoPi(atan2(east, north))` of the Camera axis (or of an Off-axis ray), in the North reference of the frame it was computed in.
- **Camera altitude**: `asin(up)` of the Camera axis (or of an Off-axis ray), measured against gravity. Because the camera sees light as it arrives, a sighted point's Camera altitude is an apparent altitude in the sense of math-conventions.
- **Absolute frame**: an orientation frame whose `alpha` is referenced to magnetic north. A `deviceorientationabsolute` event, or a `deviceorientation` event whose `absolute` field is `true`, is in the Absolute frame. Android documents its rotation vector, from which these events derive, as referenced to geomagnetic north.
- **Relative frame**: an orientation frame whose `alpha` has an arbitrary zero. On iOS the raw `alpha`, `beta`, `gamma` of `deviceorientation` are in a Relative frame.
- **North reference**: the direction an azimuth is measured from: `true`, `magnetic` or `relative`.
- **Magnetic heading**: an azimuth measured from magnetic north, here `webkitCompassHeading`, which with the phone upright is the heading of the rear-camera direction.
- **Reported compass accuracy**: `webkitCompassAccuracy`. It is recorded but does not feed any 1-sigma; a negative value marks the heading as invalid.
- **Heading 1-sigma**: the 1-sigma, passed by the caller, of a Magnetic heading or of a Camera azimuth in the Absolute frame, before Declination. The default is `2°`.
- **Screen angle**: `screen.orientation.angle`, converted to radians, at the time of a sample; `null` when the browser does not provide it.
- **Declination**: the angle from true north to magnetic north, positive east, with its 1-sigma. `true azimuth = magnetic azimuth + declination` (math-conventions).
- **World Magnetic Model (WMM)**: the geomagnetic model published by NOAA NCEI and the British Geological Survey. Its current release, WMM2025, is valid from `2025-01-01T00:00:00Z` up to, not including, `2030-01-01T00:00:00Z`.
- **WMM error model**: the WMM2025 report's estimate of the 1-sigma of the model's declination, `sqrt(0.26² + (5417 / H)²)` degrees, where `H` is the model's horizontal field intensity in nT at the place and time. It is about `0.3°` at mid latitudes and `2.7°` at the edge of the WMM blackout zone.
- **WMM blackout zone**: where the WMM's horizontal field intensity is below `2000 nT`, so that compasses are unreliable and the WMM's declination is not to be used (WMM2025 report).
- **Yaw reference**: an offset that maps azimuths in one orientation frame to azimuths with a magnetic or true North reference, with the frame it was established in, the 1-sigma of that offset and the time it was established. In the Relative frame it is the only way to north. In the Absolute frame it is optional: a calibration against a known azimuth (the Sun, a landmark) that replaces the compass's own north and its Heading 1-sigma.
- **Frame reset**: an event after which a Relative frame's zero may have changed, so that a Yaw reference based on it is no longer valid (Requirement 5.17 states which resets invalidate which Yaw references).
- **Orientation sample**: the Math layer's plain record of one orientation reading: its `timeUtcMs` from the Clock, its frame (Absolute or Relative), the full Device rotation, the Screen angle, and, when available, the Magnetic heading and the Reported compass accuracy.
- **Position fix**: the Math layer's plain record of one geolocation reading: a Position, the accuracy the browser reported in metres, the 1-sigma accuracy derived from it, and its `timeUtcMs` from the Clock.
- **Coarse location**: a Position fix whose reported accuracy exceeds the limit the caller set for the operation.
- **Sighting window**: the time interval `[endUtcMs - windowLengthMs, endUtcMs]`, given by the caller, from which Orientation samples are combined.
- **Spread**: the circular standard deviation of a set of azimuths, `sqrt(-2 · ln R̄)`, where `R̄` is their mean resultant length.
- **Altitude calibration**: a pair `{ offsetRad, sigmaRad }`: the offset added to measured Camera altitudes and the 1-sigma of the altitude error that remains after it.
- **Stale**: older than the limit the caller set, measured from a time the caller passes in.
- **Sample history**: plain data that holds the recent Orientation samples, the recent Frame reset events and the latest Position fix of one Sensor source (Requirement 14).
- **Default parameters**: the named constants of Requirement 10.

## Requirements

### Requirement 1: Package boundaries and layering

**User Story:** As the skeleton's maintainer, I want every browser API confined to one thin layer of one package, so that the math can be tested everywhere and the rest of the skeleton never sees a browser object.

#### Acceptance Criteria

1. THE Sensors SHALL depend at runtime on `@alidade/core`, on one pinned World Magnetic Model package named in the design, and on no other package.
2. THE Sensors SHALL read browser APIs (`window`, `navigator`, `document`, `screen`, `DeviceOrientationEvent`, `navigator.geolocation`, `navigator.permissions`) only in Adapter modules, and the Math layer SHALL NOT reference them.
3. THE Math layer SHALL NOT read the clock, generate random numbers or perform I/O; every time and every seed SHALL be passed in as an argument.
4. THE Adapter SHALL read the time only from an injected Clock, and SHALL set the `timeUtcMs` of every Orientation sample, Position fix and Frame reset event from it at the moment the Adapter receives the browser's callback.
5. THE Sensors SHALL hand the rest of the skeleton only plain data (numbers, strings, booleans, `null`, and plain objects and arrays of them), never a browser event or object.
6. THE Sensors SHALL export its public API only from `src/index.ts`, and its `package.json` exports map SHALL expose only `"."`.
7. THE Sensors SHALL take every angle from a browser API in degrees, convert it to radians with Core's `degToRad` at the Adapter boundary, and do all further math in radians.
8. THE Sensors SHALL build and pass its tests under TypeScript `strict` mode with no use of `any`.
9. THE Sensors SHALL name every duration with the suffix `Ms` and every time instant with the suffix `UtcMs` (math-conventions, Units and naming).

### Requirement 2: Camera axis from the device rotation

**User Story:** As a developer building on the skeleton, I want the camera direction computed from the whole device rotation, so that it stays stable when the phone is held upright, where the Euler angles are in gimbal lock.

#### Acceptance Criteria

1. THE Math layer SHALL compute the Camera axis from `alpha`, `beta` and `gamma` as `east = -(cos α · sin γ + sin α · sin β · cos γ)`, `north = -(sin α · sin γ - cos α · sin β · cos γ)`, `up = -(cos β · cos γ)`.
2. THE Math layer SHALL compute the Camera azimuth as `wrapTwoPi(atan2(east, north))` and the Camera altitude as `asin(up)`, clamping the argument of `asin` to `[-1, 1]` only when the excess is below `1e-12`.
3. THE Sensors SHALL NOT expose any function that derives a Camera azimuth or a heading from `alpha` alone or from `gamma` alone.
4. IF the horizontal part of the Camera axis, `hypot(east, north)`, is below `1e-6`, THEN THE Math layer SHALL return a failure with reason `axis_vertical` instead of a Camera azimuth, and SHALL still return the Camera altitude.
5. IF `alpha`, `beta` or `gamma` is `null`, THEN THE Adapter SHALL return a failure with reason `sensor_unavailable` for that event and SHALL NOT pass the event to the Math layer.
6. IF `alpha`, `beta` or `gamma` is `NaN` or infinite, THEN THE Math layer SHALL return a failure with reason `invalid_number`.
7. FOR ALL `alpha` in `[0°, 360°)`, `beta` in `[-180°, 180°)` and `gamma` in `[-90°, 90°)`, the Camera axis SHALL have Euclidean length `1` within `1e-12`.
8. FOR ALL `alpha`, `beta` and `gamma` in the ranges of criterion 7, the Camera axis SHALL equal the product of the three elementary rotation matrices `Rz(alpha) · Rx(beta) · Ry(gamma)` applied to `(0, 0, -1)`, built independently of the formula of criterion 1, within `1e-12` in each component.
9. FOR ALL `alpha`, `beta` and `gamma` in the ranges of criterion 7 whose Camera axis has a horizontal part of at least `1e-3`, and all `δ` with `|δ| ≤ 2π`, adding `δ` to `alpha` SHALL change the Camera azimuth by `-δ` within `1e-9` rad, compared as a wrapped difference, and SHALL leave the Camera altitude unchanged within `1e-12` rad.
10. FOR ALL `alpha`, `beta` and `gamma` in the ranges of criterion 7, and all changes `Δα`, `Δβ`, `Δγ` each of magnitude at most `1e-3` rad, the angle between the Camera axes before and after the change SHALL NOT exceed `|Δα| + |Δβ| + |Δγ| + 1e-12` rad (the axis is continuous in the rotation, including at `beta` near `90°`).

### Requirement 3: Off-axis rays

**User Story:** As a Vigia user, I want to freeze the camera image and then tap the smoke column, so that my bearing points at the smoke even when the crosshair was not exactly on it.

#### Acceptance Criteria

1. THE Math layer SHALL compute the Off-axis ray of a Ray offset `(rightRad, upRad)` under a Device rotation as `R · d`, where `d = (tan rightRad, tan upRad, -1) / ‖(tan rightRad, tan upRad, -1)‖` and `R` is the Device rotation matrix.
2. THE Math layer SHALL compute the Camera azimuth and Camera altitude of an Off-axis ray with the rules of Requirement 2.2 and 2.4.
3. IF `rightRad` or `upRad` is `NaN`, infinite, or of magnitude above `80°`, THEN THE Math layer SHALL return a failure with reason `invalid_number` naming the offending field.
4. THE Orientation sample SHALL keep the full Device rotation (`alpha`, `beta` and `gamma` in radians), so that an Off-axis ray can be computed for any sample after it was recorded.
5. THE sighting capture (Requirement 8), the altitude capture (Requirement 9) and the Yaw reference from a known azimuth (Requirement 5.2) SHALL each accept an optional Ray offset, applied to every sample in the Sighting window, and SHALL use the Camera axis when none is given.
6. FOR ALL `alpha`, `beta` and `gamma` in the ranges of Requirement 2.7, and all `rightRad` and `upRad` in `[-80°, 80°]`, the Off-axis ray SHALL have Euclidean length `1` within `1e-12`.
7. FOR ALL `alpha`, `beta` and `gamma` in the ranges of Requirement 2.7, the Off-axis ray of the offset `(0, 0)` SHALL equal the Camera axis of Requirement 2.1 within `1e-12` in each component.
8. FOR ALL `alpha`, `beta` and `gamma` in the ranges of Requirement 2.7, and all `rightRad` and `upRad` in `[-80°, 80°]`, mapping the Off-axis ray back to the device frame with the transpose of `R`, giving `(x, y, z)`, SHALL return `rightRad = atan2(x, -z)` and `upRad = atan2(y, -z)` within `1e-9` rad.
9. FOR ALL `alpha`, `beta`, `gamma`, `rightRad` and `upRad` as in criterion 6, the angle between the Off-axis ray and the Camera axis SHALL equal `atan(hypot(tan rightRad, tan upRad))` within `1e-9` rad.

### Requirement 4: Orientation frames by platform

**User Story:** As a Vigia user on either an iPhone or an Android phone, I want each platform's sensors used in the way the probe measured to work best, so that my sighting is as precise as the phone allows.

#### Acceptance Criteria

1. THE Adapter SHALL choose frames by browser features and event fields only, and SHALL NOT read the user-agent string or any other browser or platform name.
2. WHERE the browser supports the `deviceorientationabsolute` event (the window has an `ondeviceorientationabsolute` property), THE Adapter SHALL produce Orientation samples in the Absolute frame from those events and SHALL ignore `deviceorientation` events.
3. WHERE the browser does not support `deviceorientationabsolute`, THE Adapter SHALL produce Orientation samples from `deviceorientation` events: in the Absolute frame when the event's `absolute` field is `true`, and otherwise in the Relative frame, from the event's own raw `alpha`, `beta` and `gamma`.
4. THE Sensors SHALL NOT derive an `alpha`, or any rotation angle, from `webkitCompassHeading`.
5. WHEN a `deviceorientation` event carries a finite `webkitCompassHeading`, THE Adapter SHALL record it in the Orientation sample as the Magnetic heading of the rear camera direction, and SHALL record `webkitCompassAccuracy` as the Reported compass accuracy.
6. THE Sensors SHALL label every azimuth it reports with its North reference, SHALL report the Camera azimuth of a Relative-frame sample with the North reference `relative`, and SHALL report the Camera azimuth of an Absolute-frame sample with the North reference `magnetic`.
7. WHEN the page becomes hidden (`visibilitychange` with `document.visibilityState` equal to `"hidden"`), the window loses focus (`blur`), the page is hidden for navigation (`pagehide`), or the Sensor source is started again after being stopped, THE Adapter SHALL emit a Frame reset event, with its time and its cause, through the Sensor source.
8. WHEN the frame of an Orientation sample differs from that of the previous sample from the same Sensor source, THE Adapter SHALL emit a Frame reset event with the cause `frame_change` before delivering the sample.
9. THE Adapter SHALL record in every Orientation sample the Screen angle at the time of the event, or `null` when `screen.orientation` is not available.
10. THE Math layer SHALL compute the Camera axis and every Off-axis ray independently of the Screen angle, because the device frame is fixed to the device.

### Requirement 5: Yaw reference

**User Story:** As an iPhone user, I want the compass only to set where north is, and the gyroscope to give the precision, so that my bearing is as repeatable as the probe showed is possible. As a user of either phone, I want to calibrate north against the Sun or a landmark, so that my bearing does not depend on the compass at all.

#### Acceptance Criteria

1. THE Math layer SHALL establish a Yaw reference from the Relative-frame Orientation samples in a Sighting window that carry a usable Magnetic heading, as the circular mean of `wrapPi(magnetic heading - relative Camera azimuth)` over those samples, with the North reference `magnetic`.
2. THE Math layer SHALL establish a Yaw reference from a known azimuth of the sighted direction passed in by the caller (for example from a Sun or landmark sighting computed elsewhere), with the North reference the caller states (`true` or `magnetic`), as `wrapPi(known azimuth - m)`, where `m` is the circular mean of the Camera azimuths (or the azimuths of the Off-axis rays, Requirement 3.5), each in the frame of its sample, of the samples in the Sighting window. The samples in the window SHALL all be in one frame, Relative or Absolute; IF they are not, THEN it SHALL return a failure with reason `frame_reset`.
3. THE Math layer SHALL attach to every Yaw reference a 1-sigma: for criterion 1, the square root of the sum of the squares of the Spread of the differences and of the Heading 1-sigma; for criterion 2, the square root of the sum of the squares of the 1-sigma the caller passes with the known azimuth and of the Spread of the samples' azimuths.
4. THE Math layer SHALL record in every Yaw reference the time it was established, equal to the end of its Sighting window.
5. THE Math layer SHALL apply a Yaw reference to a Camera azimuth of the Yaw reference's own frame as `wrapTwoPi(azimuth + offset)`, with the Yaw reference's North reference.
6. IF a sample whose Magnetic heading would be used has a Camera altitude outside `[-30°, 30°]`, THEN THE Math layer SHALL return a failure with reason `compass_unreliable`, because `webkitCompassHeading` was measured only with the phone upright.
7. IF a sample whose Magnetic heading would be used has a Screen angle that is not `0` or is `null`, THEN THE Math layer SHALL return a failure with reason `compass_unreliable`, because the heading was measured only in the screen's natural orientation.
8. IF a sample's Reported compass accuracy is negative, THEN THE Math layer SHALL NOT use that sample's Magnetic heading; the Reported compass accuracy SHALL NOT otherwise affect the Yaw reference or its 1-sigma.
9. IF fewer samples that can enter the Yaw reference (the Relative-frame samples for criterion 1, all the samples for criterion 2) than the minimum the caller passes in lie in the Sighting window, THEN THE Math layer SHALL return a failure with reason `insufficient_samples`; IF enough lie in it but fewer than that minimum carry a usable Magnetic heading, THEN, for criterion 1, it SHALL return a failure with reason `compass_unreliable`.
10. IF the newest of the samples of criterion 9 in the Sighting window is Stale at the window's end, THEN THE Math layer SHALL return a failure with reason `stale_samples`; IF a Frame reset that invalidates the Yaw reference (criterion 17) lies in the Sighting window, THEN it SHALL return a failure with reason `frame_reset`.
11. IF a Frame reset that invalidates a Yaw reference (criterion 17) lies between the time the Yaw reference was established and the Sighting window of an operation that uses it (the closed interval from the earlier to the later of the two), THEN that operation SHALL return a failure with reason `frame_reset`.
12. IF the time between a Yaw reference's establishment and the end of the Sighting window of an operation that uses it exceeds the maximum age the caller passes in, THEN that operation SHALL return a failure with reason `stale_yaw_reference`.
13. IF an operation on Relative-frame samples is given no Yaw reference, THEN THE Math layer SHALL return a failure with reason `no_yaw_reference`.
14. FOR ALL relative Camera azimuths in `[0, 2π)`, offsets in `(-π, π]` and sets of 1 to 50 samples with Camera altitudes in `[-30°, 30°]` and Screen angle `0`, whose Magnetic headings equal `wrapTwoPi(relative azimuth + offset)` exactly, the Yaw reference of criterion 1 SHALL equal the offset within `1e-9` rad as a wrapped difference, and applying it to each sample SHALL reproduce its Magnetic heading within `1e-9` rad.
15. FOR ALL Device rotations in the ranges of Requirement 2.7 whose Camera axis has a horizontal part of at least `1e-3`, in either frame, held constant over a Sighting window, known azimuths in `[0, 2π)` and known 1-sigmas in `[0, 45°]`, the Yaw reference of criterion 2 SHALL map the samples' Camera azimuth to the known azimuth within `1e-9` rad, and its 1-sigma SHALL equal the known 1-sigma within `1e-12` rad.
16. THE Yaw reference SHALL record the frame of the samples it was established from; a Yaw reference of criterion 1 is always in the Relative frame.
17. A Frame reset of any cause SHALL invalidate a Relative-frame Yaw reference. Only a Frame reset with the cause `frame_change` SHALL invalidate an Absolute-frame Yaw reference, because the Absolute frame's zero does not depend on the state of the page.
18. IF the frame of the samples in the Sighting window of an operation differs from the frame of the Yaw reference passed to it, THEN that operation SHALL return a failure with reason `frame_reset`, and SHALL NOT ignore the Yaw reference.

### Requirement 6: Declination

**User Story:** As a Vigia user, I want magnetic headings turned into true azimuths, so that my bearing agrees with the map, which is drawn to true north.

#### Acceptance Criteria

1. THE Math layer SHALL convert a magnetic azimuth to a true azimuth as `wrapTwoPi(magnetic azimuth + declination)`, with Declination in radians, positive east.
2. THE Math layer SHALL take Declination, with its 1-sigma, as data passed in by the caller, and SHALL NOT compute it inside the capture or Yaw reference functions.
3. THE Math layer SHALL combine the 1-sigma of the Declination with the 1-sigma of the azimuth it corrects, as the square root of the sum of squares.
4. IF a true azimuth is requested from a magnetic one and no Declination is given, THEN THE Math layer SHALL return a failure with reason `declination_unknown`, and SHALL NOT assume a Declination of zero.
5. IF a Declination is `NaN`, infinite, or of magnitude above `π/2`, or its 1-sigma is `NaN`, infinite or negative, THEN THE Math layer SHALL return a failure with reason `invalid_number`.
6. THE Sensors SHALL provide a function that returns the Declination at a Position and a `timeUtcMs` from the World Magnetic Model, through the pinned dependency, at a height of `0` above the WGS84 ellipsoid, with the 1-sigma of the WMM error model, `sqrt(0.26² + (5417 / H)²)` degrees, computed from the horizontal intensity `H` the model returns for that Position and time.
7. IF the time is before `2025-01-01T00:00:00Z` or at or after `2030-01-01T00:00:00Z` (outside the WMM2025 validity dates), THEN the function of criterion 6 SHALL return a failure with reason `declination_unknown`.
8. IF the Position lies in the WMM blackout zone, THEN the function of criterion 6 SHALL return a failure with reason `declination_unknown`.
9. IF the Position is not a Supported position, THEN the function of criterion 6 SHALL return a failure with reason `unsupported_position`; IF the time is `NaN` or infinite, a failure with reason `invalid_number`.
10. WHEN evaluated at each point of the official WMM2025 test values, the World Magnetic Model computation SHALL return the published declination within `0.01°`, the precision to which the values are published.
11. FOR ALL magnetic azimuths in `[0, 2π)` and Declinations in `[-π/2, π/2]`, converting to a true azimuth and back with the negated Declination SHALL return the magnetic azimuth within `1e-12` rad, compared as a wrapped difference.

### Requirement 7: Position

**User Story:** As a Vigia user, I want the app to tell me when it only knows roughly where I am, so that a fix built on a 2 km guess is never presented as precise.

#### Acceptance Criteria

1. THE Sensor source SHALL start geolocation only when the caller asks for positions, separately from orientation, so that an application that needs no position (Nonius) never requests it.
2. THE Adapter SHALL produce a Position fix from each geolocation reading, converting `latitude` and `longitude` from degrees to radians, keeping the reported `accuracy` in metres, and setting its `timeUtcMs` from the Clock.
3. THE Math layer SHALL derive the 1-sigma position accuracy of a Position fix as the reported accuracy divided by a confidence scale the caller passes in; the default scale is `1`, so that the reported accuracy is taken as the 1-sigma.
4. IF the reported accuracy of a Position fix exceeds the limit the caller sets for the operation, THEN THE Sensors SHALL return a failure with reason `coarse_location` that carries the reported accuracy in metres, so that the caller can show it.
5. IF the reported accuracy is `NaN`, infinite or negative, or the position is not a Supported position, THEN THE Sensors SHALL return a failure with reason `invalid_position`.
6. IF the browser denies geolocation, THEN THE Adapter SHALL return a failure with reason `permission_denied`; IF it reports the position unavailable, a failure with reason `position_unavailable`; IF no reading arrives within the position timeout the caller sets, a failure with reason `position_timeout`.
7. IF a Position fix is Stale at the time the caller passes in, THEN THE Sensors SHALL return a failure with reason `stale_position`.
8. THE Sensors SHALL report the accuracy of every Position fix it returns, including those within the caller's limit, and SHALL NOT replace it with a default.
9. FOR ALL latitudes in `[-89°, 89°]`, longitudes in `(-180°, 180°]` and reported accuracies in `[0, 10 000]` m, the Position fix SHALL hold the latitude and longitude in radians within `1e-15` rad of `degToRad` of the input, and the reported accuracy unchanged.
10. FOR ALL reported accuracies in `[0, 10 000]` m and confidence scales in `[0.1, 10]`, the 1-sigma position accuracy SHALL equal the reported accuracy divided by the scale within a relative `1e-15`.

### Requirement 8: Sighting capture

**User Story:** As a Vigia user, I want a sighting to average the readings of a short moment, so that a shaky hand produces one honest bearing with an uncertainty that shows how steady I was.

#### Acceptance Criteria

1. THE Math layer SHALL combine the Orientation samples whose `timeUtcMs` lies in the Sighting window `[endUtcMs - windowLengthMs, endUtcMs]`, with `endUtcMs` and `windowLengthMs` passed in by the caller, into one azimuth, the circular mean of their true Camera azimuths, each taken from the Camera axis or, when a Ray offset is given, from the Off-axis ray (Requirement 3).
2. THE Math layer SHALL take the true Camera azimuth of a Relative-frame sample through a Yaw reference (Requirement 5); of an Absolute-frame sample through a Yaw reference when one is given, and otherwise from its magnetic Camera azimuth; and SHALL apply Declination (Requirement 6) whenever the resulting North reference is `magnetic`.
3. THE Math layer SHALL compute the azimuth 1-sigma of the capture as the square root of the sum of the squares of the Spread of the samples' true Camera azimuths and of the 1-sigma of their North reference, floored at `0.01°`. The North-reference 1-sigma is: when a Yaw reference is used, the Yaw reference's 1-sigma; for an Absolute-frame sample without one, the Heading 1-sigma passed by the caller; in both cases combined with the Declination's 1-sigma when Declination is applied (Requirement 6.3).
4. THE Math layer SHALL return the capture as a Bearing observation of Core, with the id and the `timeUtcMs` the caller passes in, the observer Position from the Position fix the caller passes in, the observer accuracy from that fix's 1-sigma (Requirement 7.3), and the azimuth and 1-sigma of criteria 1 and 3, and SHALL validate it with Core's `validateBearing`, returning its failure if it is invalid.
5. THE Math layer SHALL check the Position fix at the window's end against the position staleness limit (Requirement 7.7) and the Coarse location limit (Requirement 7.4) the caller passes in.
6. IF fewer samples than the minimum the caller passes in lie in the Sighting window, THEN THE Math layer SHALL return a failure with reason `insufficient_samples`.
7. IF the newest sample in the Sighting window is Stale at the window's end, THEN THE Math layer SHALL return a failure with reason `stale_samples`.
8. IF the samples in the Sighting window are not all in the same frame, or a Yaw reference is given and its frame differs from theirs (Requirement 5.18), or a Frame reset that invalidates the Yaw reference lies in the Sighting window or between the Yaw reference and the window (Requirement 5.11, 5.17), or the samples are in the Relative frame and a Frame reset lies in the Sighting window, THEN THE Math layer SHALL return a failure with reason `frame_reset`.
9. IF any sample in the Sighting window has no true Camera azimuth (because of `axis_vertical`, `no_yaw_reference`, `stale_yaw_reference` or `declination_unknown`), THEN THE Math layer SHALL return that failure and SHALL NOT drop the sample.
10. IF the azimuth 1-sigma of criterion 3 exceeds `45°`, THEN THE Math layer SHALL return a failure with reason `too_unsteady`.
11. FOR ALL sets of 2 to 200 samples whose true azimuths lie within `30°` of a common direction, and all rotations `δ` in `[0, 2π)`, adding `δ` to every sample's true azimuth SHALL add `δ` to the captured azimuth within `1e-9` rad, compared as a wrapped difference, and SHALL leave the azimuth 1-sigma unchanged within `1e-12` rad.
12. FOR ALL sets as in criterion 11, reordering the samples SHALL change neither the captured azimuth nor its 1-sigma by more than `1e-12` rad.
13. FOR ALL sets as in criterion 11, adding samples whose `timeUtcMs` lies outside the Sighting window SHALL leave the capture exactly unchanged.
14. FOR ALL sets as in criterion 11 whose samples all have the same true azimuth, the Spread SHALL be `0` within `1e-12` rad, and the azimuth 1-sigma SHALL equal the larger of `0.01°` and the North-reference 1-sigma within `1e-12` rad.
15. FOR ALL sets as in criterion 11 that straddle the `0` / `2π` boundary, the captured azimuth SHALL equal that of the same set rotated `π` and rotated back, within `1e-9` rad.
16. WHEN 2000 samples are drawn with a fixed seed from a wrapped normal distribution of 1-sigma `1°` around a fixed azimuth, THE Spread SHALL lie within `5 %` of `1°`.

### Requirement 9: Camera altitude

**User Story:** As a Nonius user, I want the camera's altitude reported with an uncertainty that covers the phone's unexplained bias, so that a sight is never presented as more accurate than it is, and an app can tighten it once a calibration exists.

#### Acceptance Criteria

1. THE Math layer SHALL report the apparent altitude of a capture as the arithmetic mean of the Camera altitudes (or the altitudes of the Off-axis rays, Requirement 3.5) of the samples in the Sighting window, plus the `offsetRad` of an Altitude calibration the caller passes in.
2. THE Math layer SHALL require an Altitude calibration for every altitude capture, and THE Sensors SHALL export `UNCALIBRATED_ALTITUDE = { offsetRad: 0, sigmaRad: 3.5° }` for use until a calibration is available.
3. THE Math layer SHALL report the 1-sigma of the apparent altitude as the square root of the sum of the squares of the standard deviation of the samples' altitudes and of the calibration's `sigmaRad`, and SHALL report with it the standard deviation of the samples' altitudes, the Altitude calibration used and the number of samples.
4. IF fewer samples than the minimum the caller passes in lie in the Sighting window, THEN THE Math layer SHALL return a failure with reason `insufficient_samples`; IF the newest sample in it is Stale at the window's end, a failure with reason `stale_samples`.
5. IF the calibration's `offsetRad` or `sigmaRad` is `NaN` or infinite, or its `sigmaRad` is negative, THEN THE Math layer SHALL return a failure with reason `invalid_number`.
6. IF the calibrated apparent altitude lies outside `[-π/2, π/2]`, THEN THE Math layer SHALL return a failure with reason `invalid_altitude`.
7. FOR ALL Camera altitudes in `[-80°, 80°]` and calibration offsets in `[-10°, 10°]`, a capture of samples that all have that Camera altitude SHALL report an apparent altitude equal to the Camera altitude plus the offset within `1e-12` rad, and a 1-sigma equal to the calibration's `sigmaRad` within `1e-12` rad.
8. FOR ALL sets of 2 to 200 Camera altitudes in `[-80°, 80°]` and shifts `δ` that keep every altitude in `[-80°, 80°]`, adding `δ` to every altitude SHALL add `δ` to the apparent altitude within `1e-12` rad and SHALL leave the 1-sigma unchanged within `1e-12` rad.
9. FOR ALL sets as in criterion 8, reordering the samples SHALL change neither the apparent altitude nor its 1-sigma by more than `1e-12` rad.

### Requirement 10: Default parameters

**User Story:** As an app developer, I want measured, named defaults for every tunable limit, so that I can start with sensible values and see in my own code which values I chose.

#### Acceptance Criteria

1. THE Sensors SHALL export, from one module, the following named constants: a Sighting window length of `1000 ms`, a minimum of `10` samples, a sample staleness limit of `500 ms`, a position staleness limit of `30 000 ms`, a Coarse location limit of `100 m`, an orientation listening timeout of `3000 ms`, a position timeout of `30 000 ms`, a Yaw reference maximum age of `60 000 ms`, a Heading 1-sigma of `2°`, a position confidence scale of `1`, a sample retention of `5000 ms` and a Frame reset retention of `120 000 ms` (Requirement 14).
2. THE functions of Sensors SHALL take each of these values as a parameter, and SHALL NOT read a default implicitly.
3. IF a duration parameter is `NaN`, infinite or negative (or, for a Sighting window length, zero), a sample count is not an integer of at least `1`, a 1-sigma is `NaN`, infinite or negative, a confidence scale is not finite and positive, or a limit in metres is not finite and positive, THEN the function SHALL return a failure with reason `invalid_number` naming the parameter.
4. THE minimum of `10` samples in a `1000 ms` window assumes an orientation event rate of at least `10 Hz`; this assumption SHALL be stated in the documentation of the constant.

### Requirement 11: Failures and permissions

**User Story:** As an app developer, I want every way the sensors can fail to arrive as a value I can show to the user, so that a refused permission or a missing compass never crashes the page.

#### Acceptance Criteria

1. THE Sensors SHALL define its own closed set of failure reasons, documented in the public API, made of every Reason of Core and these: `permission_denied`, `permission_required`, `sensor_unavailable`, `insecure_context`, `position_unavailable`, `position_timeout`, `coarse_location`, `stale_position`, `invalid_position`, `axis_vertical`, `compass_unreliable`, `no_yaw_reference`, `stale_yaw_reference`, `frame_reset`, `declination_unknown`, `insufficient_samples`, `stale_samples`, `too_unsteady`, `invalid_altitude`. Core SHALL NOT be changed for it.
2. THE Adapter SHALL NOT request the orientation permission on its own. THE Sensor source SHALL expose a function that requests it, for the user interface to call from a user gesture (iOS requires one).
3. WHERE the browser has no `DeviceOrientationEvent.requestPermission` function, the function of criterion 2 SHALL succeed without asking.
4. IF `DeviceOrientationEvent.requestPermission` resolves to anything other than `"granted"`, or rejects, THEN the function of criterion 2 SHALL return a failure with reason `permission_denied`.
5. IF no Orientation sample arrives within the listening timeout the caller sets after orientation listening starts, THEN THE Adapter SHALL return a failure with reason `permission_required` when the browser has a `DeviceOrientationEvent.requestPermission` function and permission has not been granted through the function of criterion 2, and a failure with reason `sensor_unavailable` otherwise.
6. IF the device orientation or geolocation API is absent, THEN THE Adapter SHALL return a failure with reason `sensor_unavailable`.
7. IF the page is not a secure context, THEN THE Adapter SHALL return a failure with reason `insecure_context` before calling any sensor API.
8. THE Sensors SHALL NOT throw, and SHALL NOT return `NaN` or infinite values, for any input that passes type checking, including events whose fields are `null`, `NaN` or out of range.
9. WHEN the caller stops a Sensor source, THE Adapter SHALL remove every listener, geolocation watch and timer it added.
10. WHEN the caller starts orientation, or positions, on a Sensor source on which it is already started, THE Sensor source SHALL add no second listener, watch or timer of that kind and SHALL NOT emit a Frame reset; the call SHALL settle as a first start does, with the next valid sample or fix or with the timeout's failure.
11. IF a listener the caller registered throws, THEN THE Sensor source SHALL still deliver the event to the other listeners and SHALL keep running.

### Requirement 12: Simulator source

**User Story:** As a reviewer on a laptop, I want to drive every sensor flow from a seeded simulator, so that I can exercise the whole app without a phone and without going outside.

#### Acceptance Criteria

1. THE Sensors SHALL provide a Simulator source that implements the Sensor source interface, so that a caller cannot tell it from the browser Adapters by its type; the controls that drive the simulation SHALL be a separate object.
2. THE Simulator source SHALL generate Raw orientation events, Position fixes and Frame reset events from a script and a seed passed in by the caller, on a simulated Clock that the caller advances, and SHALL turn Raw orientation events into Orientation samples with the same code as the browser Adapter.
3. THE script SHALL be able to state: the true camera direction (azimuth, altitude and roll) over time; the event interval; the frame (Absolute or Relative) and, for a Relative frame, its zero and the times and causes of its resets; the error of the Absolute frame's north; the Magnetic heading's bias, noise, occasional jumps and Reported compass accuracy; the orientation noise; a Camera altitude bias; the Screen angle; the Declination; the Position, its reported accuracy (including Coarse location) and its delays; and permission refusals, permission requirements and missing sensors.
4. THE Simulator source SHALL be deterministic: on the same JavaScript engine, the same script and the same seed SHALL produce identical outputs, including every number bit for bit.
5. THE Simulator source SHALL use only synthetic data, and no fixture of the package SHALL contain a recorded location.
6. FOR ALL camera azimuths in `[0, 2π)`, camera altitudes in `[-80°, 80°]` and rolls in `[-π, π)`, the Raw orientation event the Simulator source generates without noise SHALL have `alpha` in `[0°, 360°)`, `beta` in `[-180°, 180°)` and `gamma` in `[-90°, 90°)`, and SHALL, through the Math layer of Requirement 2, give back the camera azimuth and altitude within `1e-9` rad.
7. FOR ALL scripts with a Relative frame, a known zero, camera altitudes in `[-30°, 30°]`, Screen angle `0`, and noise-free Magnetic headings that include the scripted Declination, establishing a Yaw reference from the compass and capturing a bearing with the scripted Declination through the Math layer SHALL give the scripted true azimuth within `1e-9` rad.
8. FOR ALL seeds, two runs of the same script SHALL produce identical output sequences.

### Requirement 13: Testing split

**User Story:** As the skeleton's maintainer, I want the math tested by properties and the adapters by examples against fakes, so that both can be verified on a laptop with no device.

#### Acceptance Criteria

1. THE Math layer SHALL be covered by property tests for every FOR ALL criterion of these requirements.
2. THE Adapters SHALL be covered by example tests that run against fake `window`, `document`, `navigator`, `screen`, event and permission objects, with no real browser and no real device.
3. THE example tests of the Adapters SHALL cover each failure reason of Requirement 11.1 that an Adapter can return.
4. THE World Magnetic Model computation SHALL be covered by example tests against the official WMM2025 test values, kept as a read-only fixture with its source and checksum.
5. THE fake browser objects and every other fixture SHALL be synthetic.

### Requirement 14: Sample history

**User Story:** As an app developer, I want the package to keep the recent samples, the Frame resets and the latest position for me, so that both apps capture from the same record, a frozen image keeps the samples of its own moment, and a Frame reset is never forgotten while a Yaw reference that it invalidates is still in use.

#### Acceptance Criteria

1. THE Math layer SHALL provide a Sample history as plain, immutable data, with pure functions that take a history and one Orientation sample, one Frame reset event or one Position fix and return a new history; a history already handed out SHALL never change, so that a caller can keep the history of the moment an image was frozen and capture from it later.
2. WHEN an item is added, THE Sample history SHALL keep the Orientation samples whose `timeUtcMs` is no more than the sample retention before the newest time it has received, and the Frame reset events whose `timeUtcMs` is no more than the Frame reset retention before that time, both in the order they were added, and SHALL keep the newest Position fix.
3. THE sample retention and the Frame reset retention SHALL be parameters, with the defaults of Requirement 10.1. The documentation of the Frame reset retention SHALL state that it must be at least the Yaw reference maximum age plus the Sighting window length, so that every Frame reset that could invalidate a usable Yaw reference is still held.
4. IF the `timeUtcMs` of an item is `NaN` or infinite, THEN the function SHALL return a failure with reason `invalid_number` and SHALL leave the history unchanged. An item older than the newest already held (the clock stepped back) SHALL be accepted.
5. THE bearing capture, the altitude capture and both Yaw reference constructors SHALL accept the samples and Frame resets of a Sample history as they are.
6. FOR ALL sequences of 0 to 300 Orientation samples and 0 to 10 Frame reset events, added in any interleaving, with times that do not decrease and span up to `200 000 ms`, and all sample retentions in `[100, 10 000]` ms and Frame reset retentions in `[1000, 150 000]` ms, the Sample history SHALL hold exactly the samples and exactly the Frame resets that criterion 2 states, in the order they were added.
7. FOR ALL sequences as in criterion 6, and all bearing captures whose Sighting window begins no earlier than the sample retention before the newest time, and whose Sighting window begins and whose Yaw reference was established no earlier than the Frame reset retention before it, the capture from the Sample history SHALL equal exactly the capture from the full sequence.

## Device checks

These behaviours can be confirmed only on a phone. The criteria above do not depend on them being settled, but each one, once measured, may change a default or a limit.

1. **Android north against the Sun.** Sight the Sun with `deviceorientationabsolute` and compare the Camera azimuth, after Declination, with the Sun's true azimuth, to confirm that the Absolute frame's north is magnetic (Requirement 4.6) and to measure its error against the Heading 1-sigma of `2°`.
2. **Event rate.** Measure the orientation event rate on each test phone, to confirm the `10 Hz` assumption behind the minimum of `10` samples in a `1000 ms` window (Requirement 10.4).
3. **Compass in landscape.** Measure `webkitCompassHeading` with the screen at an angle other than `0`, to decide whether Requirement 5.7 can accept other Screen angles.
4. **Other causes of a Frame reset.** Check whether the Relative frame's zero changes on screen lock, on returning from another app, or with no visible cause, beyond the causes of Requirement 4.7.
5. **Sun calibration on Android.** Establish a Yaw reference from the Sun in the Absolute frame and sight a landmark of known azimuth over the next `60 s`, to confirm that an Absolute-frame Yaw reference holds for the Yaw reference maximum age (Requirement 5.17).
