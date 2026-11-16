# Requirements Document

## Introduction

`skeleton-sensors` is the package `skeleton/sensors` (`@alidade/sensors`). It turns raw device data into plain data for the rest of the skeleton: the direction the rear camera points, the device's position with its accuracy, and, from a short window of samples, one Bearing observation of `@alidade/core`. It also provides a deterministic, seeded simulator behind the same interface as the real sensors, so that every flow runs on a laptop.

Browser sensor APIs are touched only in this package (`tech.md`). It depends on `@alidade/core` and on nothing else in the repository (`structure.md`).

The package has two layers:

- the **math layer**: pure functions for the device rotation, the camera axis, frame and reference handling, declination, and the averaging of samples. It reads no clock, no randomness and no browser API, and it is covered by property tests;
- the **adapters**: thin code that reads the browser APIs and turns their events into plain samples for the math layer. They are covered by example tests against fake browser objects.

All conventions in `.kiro/steering/math-conventions.md` are binding, including the findings of the sensor probe of 2026-11-15. In particular: the camera azimuth and altitude come from the full device rotation, never from `alpha` or `gamma` alone; on Android the absolute orientation event is used; on iOS the compass only fixes the yaw reference and the relative frame gives the precision; compass headings are magnetic and need declination; and absolute altitude carries no accuracy claim, because the 3.3° iOS bias is unexplained.

Out of scope: React and any user interface, maps, the fix solver, the celestial model, and the computation of the Sun's position. The camera image is not covered by this spec (see open question 12).

The private folder `notes/` holds real locations and is not used. Every fixture in this package is synthetic.

## Glossary

- **Sensors**: the `@alidade/sensors` package specified here.
- **Core**: the `@alidade/core` package. **Bearing observation**, **Position**, **Supported position**, **Azimuth** and **Result** are as defined in the sighting-core requirements.
- **Math layer**: the modules of Sensors that are pure functions of their arguments (see Requirement 1).
- **Adapter**: a module of Sensors that reads a browser API (device orientation, geolocation, page visibility, permissions) and produces plain data for the Math layer.
- **Sensor source**: the interface through which the rest of the skeleton receives orientation samples, position fixes and frame events. Both the browser adapters and the Simulator source implement it.
- **Simulator source**: a Sensor source that generates samples from a seeded script instead of from a device.
- **Raw orientation event**: one W3C `DeviceOrientationEvent` as the Adapter receives it: `alpha`, `beta`, `gamma` in degrees (each possibly `null`), the `absolute` flag, which event type it arrived as (`deviceorientation` or `deviceorientationabsolute`), and on iOS `webkitCompassHeading` and `webkitCompassAccuracy` in degrees.
- **Device rotation**: the rotation `R = Rz(alpha) · Rx(beta) · Ry(gamma)` that maps device coordinates to East-North-Up (math-conventions, Frames).
- **Camera axis**: the unit vector, in East-North-Up, of the rear camera's viewing direction, the image under `R` of the device vector `(0, 0, -1)`.
- **Camera azimuth**: `wrapTwoPi(atan2(east, north))` of the Camera axis, in the north reference of the frame it was computed in.
- **Camera altitude**: `asin(up)` of the Camera axis, measured against gravity. Because the camera sees light as it arrives, a sighted point's Camera altitude is an apparent altitude in the sense of math-conventions.
- **Absolute frame**: an orientation frame whose `alpha` is referenced to an Earth direction. On Android it comes from the `deviceorientationabsolute` event.
- **Relative frame**: an orientation frame whose `alpha` has an arbitrary zero. On iOS the raw `alpha`, `beta`, `gamma` of `deviceorientation` are in a Relative frame. Its zero can change when the page loses focus.
- **North reference**: the direction an azimuth is measured from: `true`, `magnetic` or `relative`.
- **Magnetic heading**: an azimuth measured from magnetic north, such as `webkitCompassHeading`.
- **Declination**: the angle from true north to magnetic north, positive east. `true azimuth = magnetic azimuth + declination` (math-conventions).
- **Yaw reference**: an offset that maps azimuths in a Relative frame to azimuths with a magnetic or true North reference, with the 1-sigma of that offset.
- **Frame reset**: an event after which a Relative frame's zero may have changed, so that any Yaw reference based on it is no longer valid.
- **Orientation sample**: the Math layer's plain record of one orientation reading: its time, its frame (absolute or relative), the Camera axis, and, when available, the Magnetic heading and its reported accuracy.
- **Position fix**: the Math layer's plain record of one geolocation reading: a Position, the accuracy the browser reported in metres, the 1-sigma accuracy derived from it, and its time.
- **Coarse location**: a Position fix whose reported accuracy exceeds the limit the caller set for the operation.
- **Sighting window**: the time interval, given by the caller, from which Orientation samples are combined into one Bearing observation.
- **Spread**: the circular standard deviation of a set of azimuths, `sqrt(-2 · ln R̄)`, where `R̄` is their mean resultant length.
- **Stale**: older than the limit the caller set, measured from a time the caller passes in.
- **Sample time**: the time of a sample, in milliseconds. Its unit suffix is open question 1.

## Requirements

### Requirement 1: Package boundaries and layering

**User Story:** As the skeleton's maintainer, I want every browser API confined to one thin layer of one package, so that the math can be tested everywhere and the rest of the skeleton never sees a browser object.

#### Acceptance Criteria

1. THE Sensors SHALL depend at runtime on `@alidade/core` and on no other package of the repository.
2. THE Sensors SHALL read browser APIs (`window`, `navigator`, `document`, `DeviceOrientationEvent`, `navigator.geolocation`, `navigator.permissions`) only in Adapter modules, and the Math layer SHALL NOT reference them.
3. THE Math layer SHALL NOT read the clock, generate random numbers or perform I/O; every time and every seed SHALL be passed in as an argument.
4. THE Sensors SHALL hand the rest of the skeleton only plain data (numbers, strings, booleans and plain objects and arrays of them), never a browser event or object.
5. THE Sensors SHALL export its public API only from `src/index.ts`, and its `package.json` exports map SHALL expose only `"."`.
6. THE Sensors SHALL take every angle from a browser API in degrees, convert it to radians with Core's `degToRad` at the Adapter boundary, and do all further math in radians.
7. THE Sensors SHALL build and pass its tests under TypeScript `strict` mode with no use of `any`.

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

### Requirement 3: Orientation frames by platform

**User Story:** As a Vigia user on either an iPhone or an Android phone, I want each platform's sensors used in the way the probe measured to work best, so that my sighting is as precise as the phone allows.

#### Acceptance Criteria

1. WHEN the browser delivers `deviceorientationabsolute` events, THE Adapter SHALL produce Orientation samples in the Absolute frame from those events and SHALL ignore `deviceorientation` events for the Camera axis.
2. WHEN the browser delivers `deviceorientation` events with `absolute` not `true` and no `deviceorientationabsolute` events, THE Adapter SHALL produce Orientation samples in the Relative frame from the event's own raw `alpha`, `beta` and `gamma`.
3. THE Sensors SHALL NOT derive an `alpha`, or any rotation angle, from `webkitCompassHeading`.
4. WHEN a `deviceorientation` event carries `webkitCompassHeading`, THE Adapter SHALL record it in the Orientation sample as a Magnetic heading of the rear camera direction, with `webkitCompassAccuracy` as its reported accuracy.
5. THE Sensors SHALL label every azimuth it reports with its North reference, and SHALL report the Camera azimuth of a Relative-frame sample with the North reference `relative`.
6. THE Sensors SHALL label the Camera azimuth of an Absolute-frame sample with the North reference `magnetic` until open question 2 is settled, so that Declination is applied before it is used as a true azimuth.
7. WHEN the page becomes hidden or loses focus, THE Adapter SHALL emit a Frame reset event with its time, through the Sensor source.

### Requirement 4: Yaw reference for the Relative frame

**User Story:** As an iPhone user, I want the compass only to set where north is, and the gyroscope to give the precision, so that my bearing is as repeatable as the probe showed is possible.

#### Acceptance Criteria

1. THE Math layer SHALL establish a Yaw reference from a set of Relative-frame Orientation samples that carry a Magnetic heading, as the circular mean of `wrapPi(magnetic heading - relative Camera azimuth)` over the samples, with the North reference `magnetic`.
2. THE Math layer SHALL establish a Yaw reference from one known azimuth of the current camera direction passed in by the caller (for example from a Sun or landmark sighting computed elsewhere), with the North reference the caller states, as `wrapPi(known azimuth - relative Camera azimuth)`.
3. THE Math layer SHALL attach to every Yaw reference a 1-sigma: for criterion 1, the Spread of the differences combined, as the square root of the sum of squares, with a heading 1-sigma the caller passes in; for criterion 2, the 1-sigma the caller passes in with the known azimuth.
4. THE Math layer SHALL apply a Yaw reference to a Relative-frame Camera azimuth as `wrapTwoPi(relative azimuth + offset)`, with the Yaw reference's North reference.
5. IF a Magnetic heading is used while the sample's Camera altitude lies outside `[-30°, 30°]`, THEN THE Math layer SHALL return a failure with reason `compass_unreliable`, because the probe measured `webkitCompassHeading` only with the phone upright (see open question 4).
6. IF a sample's reported compass accuracy is negative, THEN THE Math layer SHALL exclude that sample's Magnetic heading, and IF no sample of the set remains, SHALL return a failure with reason `compass_unreliable`.
7. IF a Frame reset occurs after a Yaw reference was established, THEN THE Math layer SHALL treat that Yaw reference as invalid, and any operation that needs it SHALL return a failure with reason `frame_reset` until a new one is established.
8. IF an operation needs a Yaw reference and none has been established, THEN THE Math layer SHALL return a failure with reason `no_yaw_reference`.
9. FOR ALL relative Camera azimuths in `[0, 2π)`, offsets in `(-π, π]` and sets of 1 to 50 samples whose Magnetic headings equal `wrapTwoPi(relative azimuth + offset)` exactly, the established Yaw reference SHALL equal the offset within `1e-9` rad as a wrapped difference, and applying it to each sample SHALL reproduce its Magnetic heading within `1e-9` rad.

### Requirement 5: Declination

**User Story:** As a Vigia user, I want magnetic headings turned into true azimuths, so that my bearing agrees with the map, which is drawn to true north.

#### Acceptance Criteria

1. THE Math layer SHALL convert a magnetic azimuth to a true azimuth as `wrapTwoPi(magnetic azimuth + declination)`, with Declination in radians, positive east.
2. THE Math layer SHALL take Declination, and its 1-sigma, as arguments; the source of the Declination value is open question 3.
3. THE Math layer SHALL combine the 1-sigma of the Declination with the 1-sigma of the azimuth it corrects, as the square root of the sum of squares.
4. IF a true azimuth is requested from a magnetic one and no Declination is given, THEN THE Math layer SHALL return a failure with reason `declination_unknown`, and SHALL NOT assume a Declination of zero.
5. IF Declination is `NaN`, infinite, or of magnitude above `π/2`, THEN THE Math layer SHALL return a failure with reason `invalid_number`.
6. FOR ALL magnetic azimuths in `[0, 2π)` and Declinations in `[-π/2, π/2]`, converting to a true azimuth and back with the negated Declination SHALL return the magnetic azimuth within `1e-12` rad, compared as a wrapped difference.

### Requirement 6: Position

**User Story:** As a Vigia user, I want the app to tell me when it only knows roughly where I am, so that a fix built on a 2 km guess is never presented as precise.

#### Acceptance Criteria

1. THE Adapter SHALL produce a Position fix from each geolocation reading, converting `latitude` and `longitude` from degrees to radians, keeping the reported `accuracy` in metres, and keeping the reading's time.
2. THE Math layer SHALL derive the 1-sigma position accuracy of a Position fix as the reported accuracy divided by a confidence scale the caller passes in; the value of that scale for each platform is open question 6.
3. IF the reported accuracy of a Position fix exceeds the limit the caller sets for the operation, THEN THE Sensors SHALL return a failure with reason `coarse_location` that carries the reported accuracy in metres, so that the caller can show it.
4. IF the reported accuracy is `NaN`, infinite or negative, or the position is not a Supported position, THEN THE Sensors SHALL return a failure with reason `invalid_position`.
5. IF the browser denies geolocation, THEN THE Adapter SHALL return a failure with reason `permission_denied`; IF it reports the position unavailable, a failure with reason `position_unavailable`; IF it times out, a failure with reason `position_timeout`.
6. IF a Position fix is Stale at the time the caller passes in, THEN THE Sensors SHALL return a failure with reason `stale_position`.
7. THE Sensors SHALL report the accuracy of every Position fix it returns, including those within the caller's limit, and SHALL NOT replace it with a default.
8. FOR ALL latitudes in `[-89°, 89°]`, longitudes in `(-180°, 180°]` and reported accuracies in `[0, 10 000]` m, the Position fix SHALL hold the latitude and longitude in radians within `1e-15` rad of `degToRad` of the input, and the reported accuracy unchanged.

### Requirement 7: Sighting capture

**User Story:** As a Vigia user, I want a sighting to average the readings of a short moment, so that a shaky hand produces one honest bearing with an uncertainty that shows how steady I was.

#### Acceptance Criteria

1. THE Math layer SHALL combine the Orientation samples whose Sample time lies in the Sighting window `[end - length, end]`, with `end` and `length` passed in by the caller, into one azimuth, the circular mean of their true Camera azimuths.
2. THE Math layer SHALL compute the azimuth 1-sigma of the capture as the square root of the sum of the squares of the Spread of the samples' true Camera azimuths and of the 1-sigma of their North reference (the Yaw reference and Declination 1-sigmas of Requirements 4 and 5), floored at `0.01°`.
3. THE Math layer SHALL return the capture as a Bearing observation of Core, with the id, the UTC time and the Position fix the caller passes in, the observer accuracy from the Position fix's 1-sigma (Requirement 6.2), and the azimuth and 1-sigma of criteria 1 and 2, and SHALL validate it with Core's `validateBearing`, returning its failure if it is invalid.
4. IF fewer samples than the minimum the caller passes in lie in the Sighting window, THEN THE Math layer SHALL return a failure with reason `insufficient_samples`.
5. IF the newest sample in the Sighting window is Stale at the window's `end`, THEN THE Math layer SHALL return a failure with reason `stale_samples`.
6. IF a Frame reset occurs within the Sighting window, or after the Yaw reference used and before the window's `end`, THEN THE Math layer SHALL return a failure with reason `frame_reset`.
7. IF any sample in the Sighting window has no true Camera azimuth (because of `axis_vertical`, `no_yaw_reference` or `declination_unknown`), THEN THE Math layer SHALL return that failure and SHALL NOT drop the sample.
8. IF the azimuth 1-sigma of criterion 2 exceeds `45°`, THEN THE Math layer SHALL return a failure with reason `too_unsteady`.
9. FOR ALL sets of 2 to 200 samples whose true azimuths lie within `30°` of a common direction, and all rotations `δ` in `[0, 2π)`, adding `δ` to every sample's true azimuth SHALL add `δ` to the captured azimuth within `1e-9` rad, compared as a wrapped difference, and SHALL leave the azimuth 1-sigma unchanged within `1e-12` rad.
10. FOR ALL sets as in criterion 9, reordering the samples SHALL change neither the captured azimuth nor its 1-sigma by more than `1e-12` rad.
11. FOR ALL sets as in criterion 9, adding samples whose Sample times lie outside the Sighting window SHALL leave the capture exactly unchanged.
12. FOR ALL sets as in criterion 9 whose samples all have the same true azimuth, the Spread SHALL be `0` within `1e-12` rad, and the azimuth 1-sigma SHALL equal the larger of `0.01°` and the North-reference 1-sigma within `1e-12` rad.
13. FOR ALL sets as in criterion 9 that straddle the `0` / `2π` boundary, the captured azimuth SHALL equal that of the same set rotated `π` and rotated back, within `1e-9` rad.
14. WHEN 2000 samples are drawn with a fixed seed from a wrapped normal distribution of 1-sigma `1°` around a fixed azimuth, THE Spread SHALL lie within `5 %` of `1°`.

### Requirement 8: Camera altitude

**User Story:** As a Nonius user, I want the camera's altitude exposed with a calibration offset, so that the app can correct the iOS bias once its cause is known, without the package pretending to an accuracy nobody has measured.

#### Acceptance Criteria

1. THE Math layer SHALL report the apparent altitude of a capture as the circular mean of the samples' Camera altitudes in the Sighting window plus a calibration offset the caller passes in, in radians.
2. THE Math layer SHALL report, with every apparent altitude, whether a calibration offset was given, and the Spread of the samples' Camera altitudes.
3. THE Sensors SHALL NOT report an accuracy for the apparent altitude, and SHALL document that its bias is unknown (math-conventions: the 3.3° iOS bias is unexplained); how this meets the steering rule that every measurement carries a 1-sigma is open question 8.
4. IF the calibrated apparent altitude lies outside `[-π/2, π/2]`, THEN THE Math layer SHALL return a failure with reason `invalid_altitude`.
5. FOR ALL Camera altitudes in `[-80°, 80°]` and calibration offsets in `[-10°, 10°]`, the apparent altitude SHALL equal the Camera altitude plus the offset within `1e-12` rad.

### Requirement 9: Failures

**User Story:** As an app developer, I want every way the sensors can fail to arrive as a value I can show to the user, so that a refused permission or a missing compass never crashes the page.

#### Acceptance Criteria

1. THE Sensors SHALL represent every expected failure as a Result with a machine-readable reason drawn from a closed set documented in the public API: `permission_denied`, `sensor_unavailable`, `insecure_context`, `position_unavailable`, `position_timeout`, `coarse_location`, `stale_position`, `invalid_position`, `axis_vertical`, `compass_unreliable`, `no_yaw_reference`, `frame_reset`, `declination_unknown`, `insufficient_samples`, `stale_samples`, `too_unsteady`, `invalid_altitude`, `invalid_number`, and the reasons of Core it passes through.
2. IF the orientation permission request (`DeviceOrientationEvent.requestPermission`) resolves to anything other than `"granted"`, or rejects, THEN THE Adapter SHALL return a failure with reason `permission_denied`.
3. IF the device orientation or geolocation API is absent, THEN THE Adapter SHALL return a failure with reason `sensor_unavailable`.
4. IF the page is not a secure context, THEN THE Adapter SHALL return a failure with reason `insecure_context` before calling any sensor API.
5. IF no orientation event arrives within a time the caller sets after listening starts, THEN THE Adapter SHALL return a failure with reason `sensor_unavailable`.
6. THE Sensors SHALL NOT throw, and SHALL NOT return `NaN` or infinite values, for any input that passes type checking, including events whose fields are `null`, `NaN` or out of range.
7. WHEN the caller stops a Sensor source, THE Adapter SHALL remove every listener and geolocation watch it added.

### Requirement 10: Simulator source

**User Story:** As a reviewer on a laptop, I want to drive every sensor flow from a seeded simulator, so that I can exercise the whole app without a phone and without going outside.

#### Acceptance Criteria

1. THE Sensors SHALL provide a Simulator source that implements the Sensor source interface, so that a caller cannot tell it from the browser adapters by its type.
2. THE Simulator source SHALL generate Raw orientation events, Position fixes and Frame reset events from a script and a seed passed in by the caller, on a simulated clock that the caller advances.
3. THE script SHALL be able to state: the true camera direction (azimuth, altitude and roll) over time; the frame (Absolute or Relative) and, for a Relative frame, its zero and the times it resets; the Magnetic heading's bias and noise and occasional jumps; the Declination; the Position, its reported accuracy (including Coarse location) and its delays; and permission refusals and missing sensors.
4. THE Simulator source SHALL be deterministic: the same script and the same seed SHALL produce identical outputs, including every number bit for bit.
5. THE Simulator source SHALL use only synthetic data, and no fixture of the package SHALL contain a real recorded location.
6. FOR ALL camera azimuths in `[0, 2π)`, camera altitudes in `[-80°, 80°]` and rolls in `[-π, π)`, the Raw orientation event the Simulator source generates without noise SHALL, through the Math layer of Requirement 2, give back the camera azimuth and altitude within `1e-9` rad.
7. FOR ALL scripts with a Relative frame, a known zero and noise-free Magnetic headings that include the scripted Declination, a capture through the Math layer SHALL give the scripted true azimuth within `1e-9` rad.
8. FOR ALL seeds, two runs of the same script SHALL produce identical output sequences.

### Requirement 11: Testing split

**User Story:** As the skeleton's maintainer, I want the math tested by properties and the adapters by examples against fakes, so that both can be verified on a laptop with no device.

#### Acceptance Criteria

1. THE Math layer SHALL be covered by property tests for every FOR ALL criterion of these requirements.
2. THE Adapters SHALL be covered by example tests that run against fake `window`, `navigator`, event and permission objects, with no real browser and no real device.
3. THE example tests of the Adapters SHALL cover each failure reason of Requirement 9.1 that an Adapter can return.
4. THE fake browser objects and every fixture SHALL be synthetic.

## Open questions

The probe of 2026-11-15 does not settle the following. Each is left open rather than guessed; the criteria above refer to them where they depend on them.

1. **Unit suffixes for sample times and durations.** math-conventions defines only `UtcMs`, for instants since the Unix epoch. Browser event times (`event.timeStamp`) are milliseconds from the page's time origin, and window lengths and staleness limits are durations. Should samples be converted to `UtcMs` at the Adapter boundary through an injected clock, and what suffix do durations take (for example `DurationMs`)? This needs a change to math-conventions.
2. **North reference of Android's Absolute frame.** The probe measured the repeatability and drift of Android's `deviceorientationabsolute` camera azimuth (0.4° over a minute, a few degrees over several minutes), not its agreement with true north. Is its north magnetic or true? Until settled, Requirement 3.6 treats it as magnetic.
3. **Source of Declination.** A geomagnetic model (which one, which epoch, a pinned dependency or caller-supplied values) or a Sun calibration done elsewhere? The math layer takes Declination as data (Requirement 5.2); where the value comes from is not decided. At the place of the measurements the probe saw about 4° west.
4. **`webkitCompassHeading` away from upright.** Its behaviour above about 30° of camera altitude, and with the phone flat, is not measured. Requirement 4.5 refuses those headings; whether a wider range is safe is open.
5. **Compass 1-sigma for the Yaw reference.** The probe found the iOS compass repeatable to 0.75°–1.7° with occasional 4° jumps, and 4.1° ± 0.9° above the Sun's true azimuth, consistent with declination. What 1-sigma should a compass-based Yaw reference carry after Declination, and should `webkitCompassAccuracy` feed it? Requirement 4.3 takes it from the caller.
6. **Meaning of the reported geolocation accuracy.** Is `coords.accuracy` a 95 % radius, a 68 % radius, or something else, on iOS Safari and on Android Chrome? Requirement 6.2 takes the confidence scale from the caller; its value per platform is open.
7. **Default parameters.** The Sighting window length, the minimum number of samples, the staleness limits for samples and positions, the Coarse-location limit, the listening timeout, and the maximum age of a Yaw reference given Android's drift of a few degrees over several minutes. The probe does not fix these values; the criteria take them as caller-supplied parameters.
8. **Altitude and the 1-sigma rule.** math-conventions says every measurement carries a 1-sigma. Requirement 8 reports the Spread of the altitude samples (their repeatability) but no accuracy, because the 3.3° iOS bias is unexplained. Is reporting repeatability without accuracy acceptable under the steering rule, or should the rule be amended for altitude?
9. **Other causes of a Frame reset.** The probe saw the Relative frame's zero change when the page lost focus. Can it also change on screen lock, on returning from another app, or with no visible cause? Requirement 3.7 resets on loss of visibility or focus only.
10. **Screen orientation.** The probe recorded the screen orientation but its findings are for the phone held upright in portrait. Does `webkitCompassHeading` still give the rear-camera heading in landscape, and must the Adapter account for `screen.orientation`?
11. **Platform detection.** Requirement 3 chooses the frame from which events arrive. Is that enough, or must the Adapter also distinguish browsers (for example Firefox on Android, or Chrome on iOS, which uses Safari's engine)?
12. **Camera image.** `structure.md` lists the camera under `@alidade/sensors`, but this spec covers only orientation, position and capture. Does the camera stream (`getUserMedia`) belong in this spec, a later one, or `@alidade/ui`?
13. **Event rate.** The probe measured the orientation event rate per device. The value is in the private notes and is not used here; the minimum number of samples of Requirement 7.4 should be chosen with it once it is published synthetically or restated.
