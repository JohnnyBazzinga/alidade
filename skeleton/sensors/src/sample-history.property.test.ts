import fc from 'fast-check';
import { describe, it } from 'vitest';
import { captureBearing, type BearingCaptureInput } from './capture';
import type { FrameResetEvent } from './frame-reset';
import type { OrientationSample } from './orientation-sample';
import { positionFixFromReading } from './position-fix';
import {
  addFrameReset,
  addOrientationSample,
  createSampleHistory,
  type SampleHistory,
} from './sample-history';
import { rotationFromDirection } from './simulator/direction-to-rotation';
import { cappedRuns, isDeepRun } from './test-support/fast-check-setup';
import { historyCapture, historySequence, type HistorySequence } from './test-support/generators';
import { deepSame } from './test-support/deep-same';
import { checkProperty, ErrorTracker } from './test-support/property-report';

type Built = {
  samples: OrientationSample[];
  resets: FrameResetEvent[];
  order: (OrientationSample | FrameResetEvent)[];
};

/** The sequence's items as samples and resets, in the order added. */
function build(sequence: HistorySequence): Built | undefined {
  const built: Built = { samples: [], resets: [], order: [] };
  for (const item of sequence.items) {
    if (item.kind === 'sample') {
      const rotation = rotationFromDirection(
        item.azimuthRad,
        item.apparentAltitudeRad,
        item.rollRad,
      );
      if (!rotation.ok) return undefined;
      const sample: OrientationSample = {
        timeUtcMs: item.timeUtcMs,
        frame: sequence.frame,
        rotation: rotation.value,
        screenAngleRad: 0,
        magneticHeadingRad: null,
        compassAccuracyRad: null,
      };
      built.samples.push(sample);
      built.order.push(sample);
    } else {
      const reset: FrameResetEvent = { timeUtcMs: item.timeUtcMs, cause: item.cause };
      built.resets.push(reset);
      built.order.push(reset);
    }
  }
  return built;
}

function isSample(item: OrientationSample | FrameResetEvent): item is OrientationSample {
  return 'rotation' in item;
}

function addItem(history: SampleHistory, item: OrientationSample | FrameResetEvent) {
  return isSample(item) ? addOrientationSample(history, item) : addFrameReset(history, item);
}

function sameItems<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((item, index) => Object.is(item, expected[index]))
  );
}

describe('Sample history properties', () => {
  // P-14.6 — validates Req 14.6: after every add, the history holds exactly the samples and the
  // Frame resets that Req 14.2 states (no more than their retention before the newest time so far),
  // in the order added, compared by identity. 10 000 cases in test:deep (design §8).
  it('P-14.6: the history holds exactly what its retentions say', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.6',
      fc.property(historySequence(), (sequence) => {
        const built = build(sequence);
        const created = createSampleHistory(sequence);
        if (built === undefined || !created.ok) return false;
        let history = created.value;
        const seen: (OrientationSample | FrameResetEvent)[] = [];
        for (const item of built.order) {
          const next = addItem(history, item);
          if (!next.ok) return false;
          history = next.value;
          seen.push(item);
          const newest = item.timeUtcMs; // times do not decrease
          const expectedSamples = seen.filter(
            (x): x is OrientationSample =>
              isSample(x) && newest - x.timeUtcMs <= sequence.sampleRetentionMs,
          );
          const expectedResets = seen.filter(
            (x): x is FrameResetEvent =>
              !isSample(x) && newest - x.timeUtcMs <= sequence.frameResetRetentionMs,
          );
          if (
            !sameItems(history.samples, expectedSamples) ||
            !sameItems(history.frameResets, expectedResets)
          ) {
            return false;
          }
        }
        return true;
      }),
      tracker,
      { numRuns: cappedRuns() },
    );
  });

  // P-14.7 — validates Req 14.7: a bearing capture whose window begins no earlier than the sample
  // retention before the newest time, and whose window begins and Yaw reference was established no
  // earlier than the Frame reset retention before it, gives exactly the same Result from the
  // history as from the full sequence, failures included. Fails if fewer than 10 % of the cases
  // succeed, so that it cannot pass on failures alone. 10 000 cases in test:deep.
  it('P-14.7: a capture from the history equals the capture from everything', () => {
    const tracker = new ErrorTracker();
    let cases = 0;
    let successes = 0;
    const reasons = new Map<string, number>();
    checkProperty(
      'P-14.7',
      fc.property(historyCapture(), (draw) => {
        const built = build(draw.sequence);
        const created = createSampleHistory(draw.sequence);
        if (built === undefined || !created.ok) return false;
        let history = created.value;
        for (const item of built.order) {
          const next = addItem(history, item);
          if (!next.ok) return false;
          history = next.value;
        }
        const endUtcMs = draw.windowStartUtcMs + draw.windowLengthMs;
        const fix = positionFixFromReading(
          { latitudeDeg: 24.5, longitudeDeg: 118.1, accuracyM: 12 },
          endUtcMs,
          1,
        );
        if (!fix.ok) return false;
        const input = (
          samples: readonly OrientationSample[],
          frameResets: readonly FrameResetEvent[],
        ): BearingCaptureInput => ({
          id: 'h',
          timeUtcMs: endUtcMs,
          samples,
          frameResets,
          window: {
            endUtcMs,
            windowLengthMs: draw.windowLengthMs,
            minSampleCount: draw.minSampleCount,
            sampleStalenessMs: 500,
          },
          yawReference: {
            offsetRad: 0.4,
            sigmaRad: 0.01,
            northReference: draw.northReference,
            frame: draw.sequence.frame,
            establishedUtcMs: draw.establishedUtcMs,
          },
          yawReferenceMaxAgeMs: 400_000,
          headingSigmaRad: 0.03,
          declination: { declinationRad: -0.07, sigmaRad: 0.005 },
          positionFix: fix.value,
          positionStalenessMs: 30_000,
          coarseLocationLimitM: 100,
        });
        const fromHistory = captureBearing(input(history.samples, history.frameResets));
        const fromAll = captureBearing(input(built.samples, built.resets));
        cases += 1;
        if (fromAll.ok) successes += 1;
        else reasons.set(fromAll.reason, (reasons.get(fromAll.reason) ?? 0) + 1);
        return deepSame(fromHistory, fromAll);
      }),
      tracker,
      { numRuns: cappedRuns() },
    );
    if (isDeepRun()) {
      const failures = [...reasons.entries()]
        .map(([reason, count]) => `${reason} ${count}`)
        .join(', ');
      console.log(
        `[deep]   successes: ${successes} of ${cases} (${((100 * successes) / cases).toFixed(1)} %); failures: ${failures}`,
      );
    }
    if (successes < cases / 10)
      throw new Error(`P-14.7: only ${successes} of ${cases} captures succeeded`);
  });
});
