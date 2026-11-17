import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cameraPose,
  deviceRotation,
  horizontalPart,
  rayOffset,
  smallRotationChange,
} from './generators';

const SEED = 20261117;

function sample<T>(arbitrary: fc.Arbitrary<T>, count: number): T[] {
  return fc.sample(arbitrary, { numRuns: count, seed: SEED });
}

// The generators reach the edges their comments state (testing.md rule 4).
describe('generators', () => {
  it('deviceRotation stays in its domain and reaches gimbal lock and its edges', () => {
    const draws = sample(deviceRotation(), 20_000);
    const outside = draws.filter(
      (r) =>
        !(r.alphaRad >= 0 && r.alphaRad < 2 * Math.PI) ||
        !(r.betaRad >= -Math.PI && r.betaRad < Math.PI) ||
        !(r.gammaRad >= -Math.PI / 2 && r.gammaRad < Math.PI / 2),
    );
    expect(outside).toEqual([]);
    expect(draws.some((r) => r.betaRad === Math.PI / 2 && r.gammaRad === 0)).toBe(true);
    const nearLockOffsets = draws
      .map((r) => Math.abs(Math.abs(r.betaRad) - Math.PI / 2))
      .filter((d) => d > 0 && d < 1e-2);
    expect(nearLockOffsets.some((d) => d < 1e-12)).toBe(true);
    expect(nearLockOffsets.some((d) => d > 1e-4)).toBe(true);
    expect(draws.some((r) => r.betaRad === 0)).toBe(true);
    expect(draws.some((r) => r.gammaRad === -Math.PI / 2)).toBe(true);
    expect(draws.some((r) => r.alphaRad === 0)).toBe(true);
  });

  it('horizontalRotation discards a negligible share of deviceRotation draws', () => {
    const draws = sample(deviceRotation(), 100_000);
    const discarded = draws.filter((r) => horizontalPart(r) < 1e-3).length / draws.length;
    // Measured: 1 in 100 000 at this seed.
    expect(discarded).toBeLessThan(0.001);
  });

  it('smallRotationChange and rayOffset reach their ends', () => {
    const changes = sample(smallRotationChange(), 5000);
    expect(changes.some((c) => c.alphaRad === 1e-3)).toBe(true);
    expect(changes.some((c) => c.betaRad === -1e-3)).toBe(true);
    const offsets = sample(rayOffset(), 5000);
    const limit = 80 * (Math.PI / 180);
    expect(offsets.some((o) => o.rightRad === limit)).toBe(true);
    expect(offsets.some((o) => o.upRad === -limit)).toBe(true);
    expect(offsets.some((o) => o.rightRad === 0)).toBe(true);
    expect(offsets.every((o) => Math.abs(o.rightRad) <= limit && Math.abs(o.upRad) <= limit)).toBe(
      true,
    );
  });

  it('cameraPose stays in its domain and reaches gimbal lock on a log scale', () => {
    const poses = sample(cameraPose(), 20_000);
    const limit = 80 * (Math.PI / 180);
    expect(
      poses.every(
        (p) =>
          p.azimuthRad >= 0 &&
          p.azimuthRad < 2 * Math.PI &&
          Math.abs(p.apparentAltitudeRad) <= limit &&
          p.rollRad >= -Math.PI &&
          p.rollRad < Math.PI,
      ),
    ).toBe(true);
    expect(poses.some((p) => p.apparentAltitudeRad === 0 && p.rollRad === 0)).toBe(true);
    expect(poses.some((p) => p.rollRad === -Math.PI)).toBe(true);
    expect(
      poses.some((p) => p.apparentAltitudeRad !== 0 && Math.abs(p.apparentAltitudeRad) < 1e-15),
    ).toBe(true);
    expect(poses.some((p) => Math.PI - p.rollRad > 0 && Math.PI - p.rollRad < 1e-6)).toBe(true);
    expect(poses.some((p) => Math.abs(p.apparentAltitudeRad) === limit)).toBe(true);
  });
});
