import {
  cameraAxis,
  MAX_RAY_OFFSET_RAD,
  offAxisRay,
  type DeviceRotation,
  type EnuDirection,
} from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { propertyRuns } from '../test-support/fast-check-setup';
import {
  closed,
  elementSize,
  fieldOfViewStressCase,
  layoutCase,
  pointInOffsetSpace,
  rayOffset,
  sourceSize,
  uniform,
  type LayoutCase,
} from '../test-support/generators';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { offsetOfPixel, pointToRayOffset, rayOffsetToPoint } from './image-geometry';
import { imageLayout } from './image-layout';

/** The wrapped difference is not needed for these offsets (|a|,|b| <= 80°), so a plain one is used. */
function angleBetween(a: EnuDirection, b: EnuDirection): number {
  const cx = a.north * b.up - a.up * b.north;
  const cy = a.up * b.east - a.east * b.up;
  const cz = a.east * b.north - a.north * b.east;
  return Math.atan2(Math.hypot(cx, cy, cz), a.east * b.east + a.north * b.north + a.up * b.up);
}

function direction(
  rotation: DeviceRotation,
  offset: { rightRad: number; upRad: number },
): EnuDirection {
  const r = offAxisRay(rotation, offset);
  if (!r.ok) throw new Error(`offAxisRay: ${r.reason}`);
  return r.value;
}

// P-5.7 (Req 5.7): converting a Pixel point on the displayed image (offset within ±79°) to a Ray
// offset and back returns the point within 1e-9 CSS pixels.
describe('P-5.7 point -> offset -> point', () => {
  it('returns the Pixel point within 1e-9 px', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.7',
      fc.property(layoutCase().chain(pointInOffsetSpace), (c) => {
        const offset = pointToRayOffset(c.layout, c.calibration, c.point);
        if (!offset.ok) return false;
        const back = rayOffsetToPoint(c.layout, c.calibration, offset.value);
        if (!back.ok) return false;
        const error = Math.max(
          Math.abs(back.value.point.xPx - c.point.xPx),
          Math.abs(back.value.point.yPx - c.point.yPx),
        );
        tracker.record('point error [px]', error, '1e-9', `F=${c.focalPx.toPrecision(3)}`);
        return error <= 1e-9;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

// P-5.8 (Req 5.8): converting a Ray offset in [-80°, 80°] to a Pixel point and back returns the
// offset within 1e-9 rad. The point need not lie in the Element, so the inverse is the unchecked
// geometry of Req 5.2 (`offsetOfPixel`; `pointToRayOffset` refuses points outside the Element),
// over the whole closed range. Whenever the point lies inside the Element and on the image and
// the offset is at least 1e-6 rad inside ±80°, the checked function is held to the same result.
describe('P-5.8 offset -> point -> offset', () => {
  it('returns the Ray offset within 1e-9 rad', () => {
    const tracker = new ErrorTracker();
    let checkedCount = 0;
    checkProperty(
      'P-5.8',
      fc.property(layoutCase(), rayOffset(), (c, offset) => {
        const forward = rayOffsetToPoint(c.layout, c.calibration, offset);
        if (!forward.ok) return false;
        const back = offsetOfPixel(c.layout, c.focalPx, forward.value.point);
        let error = Math.max(
          Math.abs(back.rightRad - offset.rightRad),
          Math.abs(back.upRad - offset.upRad),
        );
        tracker.record(
          'offset error, unchecked inverse [rad]',
          error,
          '1e-9',
          `F=${c.focalPx.toPrecision(3)}`,
        );
        let good = error <= 1e-9;
        // The standing rule for limits: the checked inverse refuses an offset beyond
        // MAX_RAY_OFFSET_RAD, and rounding can put a value drawn exactly at the limit a few ulps
        // beyond it, so this check is made at least 1e-6 rad inside it (the exact limit has an
        // example test of its own, in image-geometry.test.ts).
        const insideLimit =
          Math.abs(offset.rightRad) <= MAX_RAY_OFFSET_RAD - 1e-6 &&
          Math.abs(offset.upRad) <= MAX_RAY_OFFSET_RAD - 1e-6;
        if (insideLimit && forward.value.insideElement && forward.value.onImage) {
          const checked = pointToRayOffset(c.layout, c.calibration, forward.value.point);
          if (!checked.ok) return false;
          checkedCount += 1;
          error = Math.max(
            Math.abs(checked.value.rightRad - offset.rightRad),
            Math.abs(checked.value.upRad - offset.upRad),
          );
          tracker.record('offset error, checked inverse [rad]', error, '1e-9');
          good &&= error <= 1e-9;
        }
        return good;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
    expect(checkedCount).toBeGreaterThan(0);
  });
});

// P-5.9 (Req 5.9): the centre of the Element gives the Ray offset (0, 0) within 1e-12 rad.
describe('P-5.9 centre', () => {
  it('gives the offset (0, 0)', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.9',
      fc.property(layoutCase(), (c) => {
        const result = pointToRayOffset(c.layout, c.calibration, {
          xPx: c.layout.elementWidthPx / 2,
          yPx: c.layout.elementHeightPx / 2,
        });
        if (!result.ok) return false;
        const error = Math.max(Math.abs(result.value.rightRad), Math.abs(result.value.upRad));
        tracker.record('centre offset [rad]', error, '1e-12');
        return error <= 1e-12;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

// P-5.10 (Req 5.10): a point right of the centre gives rightRad > 0 and one below it upRad < 0;
// the mirrored point gives the negated offset within 1e-9 rad.
describe('P-5.10 signs and mirror', () => {
  it('has the right signs and a mirror image that negates the offset', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.10',
      fc.property(layoutCase().chain(pointInOffsetSpace), (c) => {
        const ew = c.layout.elementWidthPx;
        const eh = c.layout.elementHeightPx;
        const result = pointToRayOffset(c.layout, c.calibration, c.point);
        const mirrored = pointToRayOffset(c.layout, c.calibration, {
          xPx: ew - c.point.xPx,
          yPx: eh - c.point.yPx,
        });
        if (!result.ok || !mirrored.ok) return false;
        const dx = c.point.xPx - ew / 2;
        const dy = c.point.yPx - eh / 2;
        const signs =
          (dx > 0 ? result.value.rightRad > 0 : true) &&
          (dx < 0 ? result.value.rightRad < 0 : true) &&
          (dy > 0 ? result.value.upRad < 0 : true) &&
          (dy < 0 ? result.value.upRad > 0 : true);
        const error = Math.max(
          Math.abs(mirrored.value.rightRad + result.value.rightRad),
          Math.abs(mirrored.value.upRad + result.value.upRad),
        );
        tracker.record('mirror error [rad]', error, '1e-9', `F=${c.focalPx.toPrecision(3)}`);
        return signs && error <= 1e-9;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

// P-5.11 (Req 5.11): multiplying the Element, the Pixel point and the displayed scale by
// k in [0.25, 4] leaves the Ray offset unchanged within 1e-9 rad.
describe('P-5.11 scale invariance', () => {
  it('leaves the offset unchanged when everything scales', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.11',
      fc.property(layoutCase().chain(pointInOffsetSpace), closed(0.25, 4), (c, k) => {
        const scaledLayout = imageLayout(
          c.source,
          { widthPx: c.element.widthPx * k, heightPx: c.element.heightPx * k },
          c.fit,
        );
        if (!scaledLayout.ok) return false;
        const original = pointToRayOffset(c.layout, c.calibration, c.point);
        const scaled = pointToRayOffset(scaledLayout.value, c.calibration, {
          xPx: c.point.xPx * k,
          yPx: c.point.yPx * k,
        });
        if (!original.ok || !scaled.ok) return false;
        const error = Math.max(
          Math.abs(scaled.value.rightRad - original.value.rightRad),
          Math.abs(scaled.value.upRad - original.value.upRad),
        );
        tracker.record(
          'scaled offset error [rad]',
          error,
          '1e-9',
          `F=${c.focalPx.toPrecision(3)} k=${k.toPrecision(3)}`,
        );
        return error <= 1e-9;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

// P-5.12 (Req 5.12): `cover` covers the Element, `contain` lies inside it, both keep the aspect
// ratio of the Source image within a relative 1e-12 and are centred within 1e-9 CSS pixels.
describe('P-5.12 image layout', () => {
  it('covers or fits, keeps the aspect ratio and is centred', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.12',
      fc.property(
        sourceSize(),
        elementSize(),
        fc.constantFrom('cover' as const, 'contain' as const),
        (source, element, fit) => {
          const result = imageLayout(source, element, fit);
          if (!result.ok) return false;
          const l = result.value;
          const slackW =
            fit === 'cover'
              ? Math.max(0, element.widthPx - l.displayedWidthPx)
              : Math.max(0, l.displayedWidthPx - element.widthPx);
          const slackH =
            fit === 'cover'
              ? Math.max(0, element.heightPx - l.displayedHeightPx)
              : Math.max(0, l.displayedHeightPx - element.heightPx);
          const aspect =
            Math.abs(
              l.displayedWidthPx / l.displayedHeightPx -
                source.widthSourcePx / source.heightSourcePx,
            ) /
            (source.widthSourcePx / source.heightSourcePx);
          const centre = Math.max(
            Math.abs(l.leftPx + l.displayedWidthPx / 2 - element.widthPx / 2),
            Math.abs(l.topPx + l.displayedHeightPx / 2 - element.heightPx / 2),
          );
          tracker.record('cover/contain violation [px]', Math.max(slackW, slackH), '1e-9');
          tracker.record('aspect ratio, relative', aspect, '1e-12');
          tracker.record('centring [px]', centre, '1e-9');
          // `cover` touches the Element on one axis; `contain` touches it on one axis.
          const touches =
            Math.min(
              Math.abs(l.displayedWidthPx - element.widthPx),
              Math.abs(l.displayedHeightPx - element.heightPx),
            ) <=
            1e-9 * Math.max(1, element.widthPx, element.heightPx);
          return Math.max(slackW, slackH) <= 1e-9 && aspect <= 1e-12 && centre <= 1e-9 && touches;
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

// P-5.13 (Req 5.13): under `contain`, the edge of the displayed image on the centre line along the
// calibration's axis gives |offset| = fovRad / 2 (width: left and right edges; height: top and
// bottom; diagonal: the corners, the angle taken with Sensors' Off-axis ray at the identity
// rotation), within 1e-9 rad. The calibration's image size differs from the source's (same
// aspect ratio) in some draws, which is what D7 is for.
describe('P-5.13 field of view at the edge of the image', () => {
  it('gives half the field of view at the edge, the edge and the corner', () => {
    const tracker = new ErrorTracker();
    const identity: DeviceRotation = { alphaRad: 0, betaRad: 0, gammaRad: 0 };
    checkProperty(
      'P-5.13',
      fc.property(
        layoutCase().filter((c) => c.fit === 'contain'),
        (c) => {
          const l = c.layout;
          const half = c.calibration.fovRad / 2;
          const cx = l.elementWidthPx / 2;
          const cy = l.elementHeightPx / 2;
          const left = l.leftPx;
          const right = l.leftPx + l.displayedWidthPx;
          const top = l.topPx;
          const bottom = l.topPx + l.displayedHeightPx;
          const errors: number[] = [];
          if (c.calibration.fovAxis === 'width') {
            for (const x of [left, right]) {
              const o = pointToRayOffset(l, c.calibration, { xPx: x, yPx: cy });
              if (!o.ok) return false;
              errors.push(Math.abs(Math.abs(o.value.rightRad) - half));
            }
          } else if (c.calibration.fovAxis === 'height') {
            for (const y of [top, bottom]) {
              const o = pointToRayOffset(l, c.calibration, { xPx: cx, yPx: y });
              if (!o.ok) return false;
              errors.push(Math.abs(Math.abs(o.value.upRad) - half));
            }
          } else {
            for (const [x, y] of [
              [left, top],
              [right, top],
              [left, bottom],
              [right, bottom],
            ] as const) {
              const o = pointToRayOffset(l, c.calibration, { xPx: x, yPx: y });
              if (!o.ok) return false;
              const axis = cameraAxis(identity);
              if (!axis.ok) return false;
              errors.push(Math.abs(angleBetween(direction(identity, o.value), axis.value) - half));
            }
          }
          const error = Math.max(...errors);
          tracker.record(
            `edge error, axis=${c.calibration.fovAxis} [rad]`,
            error,
            '1e-9',
            `F=${c.focalPx.toPrecision(3)}`,
          );
          return error <= 1e-9;
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

/** Domain of a Device rotation: Sensors' (alpha [0, 2π), beta [-π, π), gamma [-π/2, π/2)). */
const deviceRotation: fc.Arbitrary<DeviceRotation> = fc.record({
  alphaRad: uniform(0, 2 * Math.PI),
  betaRad: uniform(-Math.PI, Math.PI),
  gammaRad: uniform(-Math.PI / 2, Math.PI / 2),
});

// P-5.14 (Req 5.14): the angle between the Off-axis ray (at any Device rotation) and the Camera
// axis equals atan(r / F) within 1e-9 rad, r being the distance of the point from the centre.
describe('P-5.14 angle from the camera axis', () => {
  it('equals atan(r / F)', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.14',
      fc.property(layoutCase().chain(pointInOffsetSpace), deviceRotation, (c, rotation) => {
        const offset = pointToRayOffset(c.layout, c.calibration, c.point);
        if (!offset.ok) return false;
        const axis = cameraAxis(rotation);
        if (!axis.ok) return false;
        const r = Math.hypot(
          c.point.xPx - c.layout.elementWidthPx / 2,
          c.point.yPx - c.layout.elementHeightPx / 2,
        );
        const angle = angleBetween(direction(rotation, offset.value), axis.value);
        const error = Math.abs(angle - Math.atan(r / c.focalPx));
        tracker.record('angle error [rad]', error, '1e-9', `F=${c.focalPx.toPrecision(3)}`);
        return error <= 1e-9;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

/** Pixel points anywhere in the Element (ends drawn), whatever the image or the field of view. */
function pixelPointIn(c: LayoutCase): fc.Arbitrary<{ xPx: number; yPx: number }> {
  return fc.record({
    xPx: closed(0, c.layout.elementWidthPx),
    yPx: closed(0, c.layout.elementHeightPx),
  });
}

// P-5.15 (Req 5.15): a Pixel point inside the Element is accepted if and only if both
// |rightRad| and |upRad| are within MAX_RAY_OFFSET_RAD and, under `contain`, it is on the
// displayed image. Domain: points uniform in the Element, at least 1e-6 rad from the 80° limit
// on either axis and at least 1e-6 CSS pixels from an edge of the displayed image (discarded
// otherwise; the limits have example tests of their own). One draw in four is the field-of-view
// stress family (`fieldOfViewStressCase`), because the ordinary draws are refused for their field
// of view in only 0.6 % of cases. All three outcomes must occur.
describe('P-5.15 acceptance', () => {
  it('accepts exactly the points within the field of view and on the image', () => {
    const tracker = new ErrorTracker();
    const counts = { accepted: 0, outsideFov: 0, onBar: 0 };
    checkProperty(
      'P-5.15',
      fc.property(
        fc
          .oneof(
            { weight: 3, arbitrary: layoutCase() },
            { weight: 1, arbitrary: fieldOfViewStressCase() },
          )
          .chain((c) => pixelPointIn(c).map((p) => ({ c, p }))),
        ({ c, p }) => {
          const l = c.layout;
          const f = c.focalPx;
          const right = Math.atan((p.xPx - l.elementWidthPx / 2) / f);
          const up = Math.atan(-(p.yPx - l.elementHeightPx / 2) / f);
          fc.pre(
            Math.abs(Math.abs(right) - MAX_RAY_OFFSET_RAD) >= 1e-6 &&
              Math.abs(Math.abs(up) - MAX_RAY_OFFSET_RAD) >= 1e-6,
          );
          const edgeGap = Math.min(
            Math.abs(p.xPx - l.leftPx),
            Math.abs(p.xPx - (l.leftPx + l.displayedWidthPx)),
            Math.abs(p.yPx - l.topPx),
            Math.abs(p.yPx - (l.topPx + l.displayedHeightPx)),
          );
          fc.pre(c.fit === 'cover' || edgeGap >= 1e-6);
          const onImage =
            c.fit === 'cover' ||
            (p.xPx >= l.leftPx &&
              p.xPx <= l.leftPx + l.displayedWidthPx &&
              p.yPx >= l.topPx &&
              p.yPx <= l.topPx + l.displayedHeightPx);
          const withinFov =
            Math.abs(right) <= MAX_RAY_OFFSET_RAD && Math.abs(up) <= MAX_RAY_OFFSET_RAD;
          const result = pointToRayOffset(l, c.calibration, p);
          const expected = withinFov && onImage;
          if (result.ok) counts.accepted += 1;
          else if (result.reason === 'outside_field_of_view') counts.outsideFov += 1;
          else if (result.reason === 'outside_image') counts.onBar += 1;
          tracker.record('wrong decisions (must be 0)', result.ok === expected ? 0 : 1, '0');
          if (result.ok) return expected;
          const reasonRight = !onImage ? 'outside_image' : 'outside_field_of_view';
          return !expected && result.reason === reasonRight;
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
    expect(counts.accepted).toBeGreaterThan(0);
    expect(counts.outsideFov).toBeGreaterThan(0);
    expect(counts.onBar).toBeGreaterThan(0);
  });
});
