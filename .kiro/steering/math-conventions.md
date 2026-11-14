---
inclusion: always
---

# Math conventions

Sign and unit mistakes are the main source of bugs in this project. These conventions are binding. If code needs to break one, stop and ask.

## Units and naming

Every numeric name carries its unit as a suffix. Names such as `bearing`, `angle`, `distance` or `lat` with no suffix are not allowed.

| Quantity | Internal unit | Suffix | Example |
|---|---|---|---|
| Angle | radians | `Rad` | `azimuthRad` |
| Angle at an I/O boundary | degrees | `Deg` | `azimuthDeg` |
| Length | metres | `M` | `rangeM` |
| Time instant | milliseconds since Unix epoch, UTC | `UtcMs` | `timeUtcMs` |
| Variance of a length | square metres | `M2` | `covEnM2` |

- All math is done in radians. Degrees exist only in the wire format, fixtures and the UI. Conversion happens in one module.
- All time is UTC. `skeleton/core` never reads the clock and never handles time zones.

## Angles

- **Azimuth:** clockwise from **true** north, in `[0, 2π)`. East is `π/2`.
- **Magnetic azimuth** is always named `magneticAzimuthRad`. `azimuthRad = magneticAzimuthRad + declinationRad`, with declination positive east.
- **Altitude:** angle above the local horizontal plane, in `[-π/2, π/2]`. Zenith distance is `π/2 - altitude`.
- **Apparent altitude** (as measured, refraction included) and **geometric altitude** (no atmosphere) are different quantities. Name them `apparentAltitudeRad` and `geometricAltitudeRad`; never store one under a bare `altitudeRad`.
- `wrapTwoPi(x)` returns `[0, 2π)`. `wrapPi(x)` returns `(-π, π]`.
- The difference of two angles is always `wrapPi(a - b)`. Never subtract azimuths directly.
- The mean of angles is the circular mean, `atan2(Σ sin, Σ cos)`. Never average azimuths arithmetically.

## Positions

- **Latitude:** geodetic, north positive, `[-π/2, π/2]`. **Longitude:** east positive, `(-π, π]`.
- Positions are objects with named fields, `{ latRad, lonRad }`. Never use bare arrays or tuples for positions. GeoJSON's `[lon, lat]` order appears only at the map boundary.
- **Earth model:** a sphere of radius `6 371 008.8 m`. The ellipsoid is ignored on purpose: its effect (under 0.2° in azimuth) is far below phone sensor noise. Do not introduce Vincenty or other ellipsoidal formulas.
- Positions within 1° of a pole are unsupported and rejected with an explicit error.

## Frames

- **Local frame:** East-North-Up (ENU), right-handed, in metres, tangent at a stated origin. The unit vector for azimuth `A` and altitude `h` is `(cos h · sin A, cos h · cos A, sin h)`.
- **Device frame** (W3C): `x` to the right of the screen, `y` to the top of the screen, `z` out of the screen toward the user. The rear camera looks along `-z`.
- **Device rotation** (W3C `alpha`, `beta`, `gamma`): `R = Rz(alpha) · Rx(beta) · Ry(gamma)` maps device coordinates to ENU. The rear camera axis in ENU is:

  ```
  east  = -(cos α · sin γ + sin α · sin β · cos γ)
  north = -(sin α · sin γ - cos α · sin β · cos γ)
  up    = -(cos β · cos γ)
  ```

  Camera azimuth is `atan2(east, north)` and camera altitude is `asin(up)`. Compute both from the full rotation; never read heading from `alpha` alone. This formula must be confirmed against recorded phone data before the sensors package relies on it, because iOS does not report an absolute `alpha`.

## Celestial

- A body's geographic position is `latRad = declination`, `lonRad = wrapPi(-GHA)`.
- Local hour angle is `LHA = GHA + lonRad` (east longitude positive).
- Computed altitude: `sin h = sin φ · sin δ + cos φ · cos δ · cos LHA`.
- The phone measures altitude against gravity, so there is no dip correction. The crosshair sights the centre of the body, so there is no semi-diameter correction.

## Uncertainty

- Every measurement carries a 1-sigma standard deviation (`sigmaRad`, `sigmaM`).
- Every fix carries a 2×2 covariance in local East-North metres, `covEnM2`, and the ellipse derived from it.
- Ellipses are displayed at 95% confidence: 1-sigma axes multiplied by `2.4477` (`sqrt(5.991)`, chi-square with 2 degrees of freedom).
- A fix is never returned, stored or displayed without its uncertainty.

## Numbers

- Never compare floating-point values with `===`. Use the tolerances stated in the spec being implemented.
- No `NaN` or `Infinity` may leave a public function. Invalid input produces an error result.
- Guard `asin` and `acos` arguments by clamping to `[-1, 1]` only when the excess is rounding error (under `1e-12`); a larger excess is a bug and must surface.
