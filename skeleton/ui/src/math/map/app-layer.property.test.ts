import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  appCollection,
  appPaint,
  badCollection,
  badId,
  badPaint,
  validId,
} from '../../test-support/app-layer-generators';
import { deepSame } from '../../test-support/deep-same';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { hostileNumber } from '../../test-support/hostile';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { checkLayerCollection, checkLayerId, checkLayerPaint } from './app-layer';

const RUNS = 10_000;

// P-15.15 (Req 15.14, 15.15): `checkLayerId`, `checkLayerPaint` and `checkLayerCollection` accept
// exactly the valid draws and refuse each single defect with `invalid_number` naming the field of
// design D31.3; a valid collection comes back deeply equal to what was given, as a different
// object. Domain: `validId`, `appPaint` and `appCollection` for the valid draws (identifiers of 1
// to 32 characters, widths and radii in (0, 16], opacities in (0, 1], dashes of 0 to 4, 0 to 3
// features at longitudes in [-179.9°, 179.9°] and latitudes in [-88.9°, 88.9°]); `badId`,
// `badPaint` and `badCollection` for the defects, each with the field a refusal must name (the
// 2 001-feature collection is one draw in forty). Hostile arguments of every kind are the second
// test.
describe('P-15.15 the checks of an application layer', () => {
  it('accept the valid and refuse each defect by name', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-15.15',
      fc.property(
        validId(),
        appPaint(),
        appCollection(),
        badId(),
        badPaint(),
        badCollection(),
        (id, paint, collection, bId, bPaint, bCollection) => {
          const okId = checkLayerId(id);
          const okPaint = checkLayerPaint(paint);
          const okCollection = checkLayerCollection(collection);
          const goodAccepted =
            okId.ok &&
            okId.value === id &&
            okPaint.ok &&
            deepSame(okPaint.value, paint) &&
            okCollection.ok &&
            deepSame(okCollection.value, collection) &&
            okCollection.value !== collection;
          const failedId = checkLayerId(bId.value);
          const failedPaint = checkLayerPaint(bPaint.value);
          const failedCollection = checkLayerCollection(bCollection.value);
          const defectsNamed =
            !failedId.ok &&
            failedId.reason === 'invalid_number' &&
            failedId.field === bId.field &&
            !failedPaint.ok &&
            failedPaint.reason === 'invalid_number' &&
            failedPaint.field === bPaint.field &&
            !failedCollection.ok &&
            failedCollection.reason === 'invalid_number' &&
            failedCollection.field === bCollection.field;
          tracker.record('valid draws refused (must be 0)', goodAccepted ? 0 : 1, '0');
          tracker.record('defects not named (must be 0)', defectsNamed ? 0 : 1, '0');
          return goodAccepted && defectsNamed;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });

  // Domain: anything fast-check can build (`fc.anything`, with `NaN`, `±Infinity`, `-0`,
  // `undefined`, objects, arrays, strings of 0 to 10 000 characters) and collections whose
  // coordinates are `hostileNumber()`. Nothing is excluded: the checks never throw.
  it('never throw, whatever they are given', () => {
    const tracker = new ErrorTracker();
    const long = fc.string({ minLength: 0, maxLength: 10_000 });
    const hostileCollection = fc
      .array(
        fc.tuple(hostileNumber(), hostileNumber()).map(([lon, lat]) => ({
          type: 'Feature',
          id: 'k:0',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { kind: 'k', id: '0' },
        })),
        { maxLength: 4 },
      )
      .map((features) => ({ type: 'FeatureCollection', features }));
    checkProperty(
      'P-15.15 hostile',
      fc.property(
        fc.oneof(fc.anything(), long, hostileNumber()),
        hostileCollection,
        (anything, collection) => {
          let threw = 0;
          for (const f of [checkLayerId, checkLayerPaint, checkLayerCollection]) {
            try {
              f(anything);
            } catch {
              threw += 1;
            }
          }
          try {
            const r = checkLayerCollection(collection);
            if (r.ok) {
              // A valid hostile collection is one whose numbers happen to be Supported: it is a copy.
              if (!deepSame(r.value, collection)) threw += 1;
            }
          } catch {
            threw += 1;
          }
          tracker.record('calls that threw or changed a value (must be 0)', threw, '0');
          return threw === 0;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    expect(tracker.worst('calls that threw or changed a value (must be 0)')).toBe(0);
  });
});
