import { wrapPi } from '@alidade/core';
import { createSimulator, declinationAt } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { stationScriptCase } from '../../test-support/station-script-generators';
import { deepSame } from '../../test-support/deep-same';
import {
  scriptForStation,
  MAX_SCRIPT_ALTITUDE_RAD,
  SCRIPT_START_UTC_MS,
} from './script-for-station';
import { targetDirection } from './target-direction';

const RUNS = 10_000;
const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

// P-17.15 (Req 17.15): for every scene built by `sceneFromOffsets` from generated offsets, every
// Station and Target of it and valid options, the script of `scriptForStation` passes the
// Simulator's own validation, and its first pose points at the Target from that Station: its
// azimuth and apparent altitude equal `targetDirection`'s within 1e-12 rad (the altitude clamped
// to the Simulator's ±80°). Domain: `stationScriptCase` (design §8). The options are also given in
// the reverse order of their keys, which must change nothing. The clamped cases are counted and
// must not be none, or the clamp is not exercised.
describe('P-17.15 the script of a Station points at its Target', () => {
  it('starts on the Target from the Station, within the Simulator limits', () => {
    const tracker = new ErrorTracker();
    let clamped = 0;
    let cases = 0;
    checkProperty(
      'P-17.15',
      fc.property(stationScriptCase(), (c) => {
        cases += 1;
        const made = scriptForStation(c.scene, c.stationId, c.aimTargetId, c.options);
        if (!made.ok) return false;
        const script = made.value;
        if (!createSimulator(script, 1, SIMULATOR_OPTIONS).ok) return false;
        const station = c.scene.stations.find((s) => s.id === c.stationId);
        const target = c.scene.targets.find((t) => t.id === c.aimTargetId);
        if (station === undefined || target === undefined) return false;
        const direction = targetDirection(station, target);
        if (!direction.ok) return false;
        const pose = script.pose[0];
        if (script.pose.length !== 1 || pose === undefined) return false;
        const wanted = Math.max(
          -MAX_SCRIPT_ALTITUDE_RAD,
          Math.min(MAX_SCRIPT_ALTITUDE_RAD, direction.value.apparentAltitudeRad),
        );
        if (wanted !== direction.value.apparentAltitudeRad) clamped += 1;
        const difference = wrapPi(pose.azimuthRad - direction.value.azimuthRad);
        if (!difference.ok) return false;
        const azimuthError = Math.abs(difference.value);
        const altitudeError = Math.abs(pose.apparentAltitudeRad - wanted);
        tracker.record('azimuth against targetDirection (rad)', azimuthError, '1e-12');
        tracker.record(
          'altitude against the clamped targetDirection (rad)',
          altitudeError,
          '1e-12',
        );
        const startUtcMs = c.options.startUtcMs ?? SCRIPT_START_UTC_MS;
        const declination = declinationAt(station.position, startUtcMs);
        const keys = Object.entries(c.options).reverse();
        const reversed = scriptForStation(
          c.scene,
          c.stationId,
          c.aimTargetId,
          Object.fromEntries(keys),
        );
        return (
          azimuthError <= 1e-12 &&
          altitudeError <= 1e-12 &&
          pose.timeUtcMs === startUtcMs &&
          pose.rollRad === 0 &&
          script.startUtcMs === startUtcMs &&
          declination.ok &&
          script.declinationRad === declination.value.declinationRad &&
          script.position?.kind === 'fix' &&
          script.position.position.latRad === station.position.latRad &&
          script.position.position.lonRad === station.position.lonRad &&
          script.position.reportedAccuracyM === (c.options.fixAccuracyM ?? 5) &&
          script.orientationNoiseSigmaRad === (c.options.orientationNoiseSigmaRad ?? 0) &&
          reversed.ok &&
          deepSame(reversed.value, script)
        );
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    tracker.record('cases with a clamped altitude (must not be 0)', clamped === 0 ? 1 : 0, '0');
    console.log(`[coverage] P-17.15: ${cases} cases, ${clamped} with a clamped altitude`);
    expect(clamped).toBeGreaterThan(0);
  });
});
