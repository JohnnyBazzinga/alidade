import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CapturedResult } from '../math/session/session';
import { sessionInState } from '../test-support/session-fixtures';
import { CaptureSummary } from './CaptureSummary';
import { LIMITS_TEXT } from './LimitsNote';

function captured(kind: 'bearing' | 'altitude'): CapturedResult {
  const c = sessionInState('captured', kind).session.captured;
  if (c === null) throw new Error('not captured');
  return c;
}
const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
const deg2 = (rad: number) => ((rad * 180) / Math.PI).toFixed(2);

describe('CaptureSummary (Req 13.5, 13.6, 12.6)', () => {
  it('shows the bearing with its 1-sigma beside it, and the limits line', () => {
    const result = captured('bearing');
    if (result.kind !== 'bearing') throw new Error('kind');
    const { getByTestId } = render(<CaptureSummary result={result} />);
    const sigma = deg(result.bearing.azimuthSigmaRad);
    expect(
      getByTestId('capture-summary').querySelector('[data-part="headline"]')?.textContent,
    ).toBe(`Bearing ${deg(result.bearing.azimuthRad)}° true, 1-sigma ±${sigma}°`);
    expect(getByTestId('limits-note').textContent).toBe(LIMITS_TEXT);
    expect(LIMITS_TEXT).toMatch(/several degrees/);
    expect(LIMITS_TEXT).toMatch(/Sun or a landmark/);
  });

  it('names each part of a bearing with its own 1-sigma: shake, the phone compass, the Declination (Req 13.5)', () => {
    const result = captured('bearing');
    if (result.kind !== 'bearing' || result.declination === null || result.north === null)
      throw new Error('fixture');
    const { getByTestId } = render(<CaptureSummary result={result} />);
    const items = [...getByTestId('capture-summary').querySelectorAll('li')].map(
      (l) => l.textContent,
    );
    expect(items).toEqual([
      `Hand shake ±${deg2(result.azimuthSpreadRad)}°: how much the readings scattered while you sighted.`,
      `North from the phone\u2019s compass ±${deg2(result.north.sigmaRad)}°: the heading accuracy the app assumes.`,
      `Declination ±${deg2(result.declination.sigmaRad)}°: from magnetic to true north.`,
    ]);
  });

  it('names the source of a Yaw reference, and leaves out a Declination it did not use', () => {
    const base = captured('bearing');
    if (base.kind !== 'bearing') throw new Error('kind');
    for (const [source, words] of [
      ['compass', 'North set from the compass'],
      ['known-azimuth', 'North set from a known azimuth'],
    ] as const) {
      const r: CapturedResult = { ...base, north: { source, sigmaRad: 0.004 }, declination: null };
      const { getByTestId, unmount } = render(<CaptureSummary result={r} />);
      const items = [...getByTestId('capture-summary').querySelectorAll('li')].map(
        (l) => l.textContent ?? '',
      );
      expect(items[1]).toBe(`${words} ±0.23°.`);
      expect(items.some((i) => i.startsWith('Declination'))).toBe(false);
      unmount();
    }
  });

  it('with a Mark adds the lens and tap with its sigma as it enters the result', () => {
    const base = captured('bearing');
    const marked: CapturedResult = {
      ...base,
      markSigmaRad: 0.0123,
      mark: {
        offset: { rightRad: 0.1, upRad: 0 },
        imageSigmaRad: 0.012,
        calibration: {
          fovRad: 1,
          fovAxis: 'width',
          fovSigmaRad: 0.01,
          imageWidthSourcePx: 720,
          imageHeightSourcePx: 1280,
        },
      },
    };
    const { getByTestId } = render(<CaptureSummary result={marked} />);
    const items = [...getByTestId('capture-summary').querySelectorAll('li')].map(
      (l) => l.textContent,
    );
    expect(items[items.length - 1]).toBe(
      'Lens and tap ±0.70°: the lens\u2019s field of view and your tap.',
    );
  });

  it('with no Mark has no lens-and-tap part (a part the capture does not use is left out)', () => {
    const { getByTestId } = render(<CaptureSummary result={captured('bearing')} />);
    expect(getByTestId('capture-summary').textContent).not.toMatch(/Lens and tap/);
  });

  it('shows an altitude with its 1-sigma and its parts, with no north or declination line', () => {
    const result = captured('altitude');
    if (result.kind !== 'altitude') throw new Error('kind');
    const marked: CapturedResult = { ...result, markSigmaRad: 0.0123 };
    const { getByTestId } = render(<CaptureSummary result={marked} />);
    const el = getByTestId('capture-summary');
    expect(el.querySelector('[data-part="headline"]')?.textContent).toBe(
      `Altitude ${deg(result.altitude.apparentAltitudeRad)}°, 1-sigma ±${deg(result.altitude.sigmaRad)}°`,
    );
    const items = [...el.querySelectorAll('li')].map((l) => l.textContent);
    expect(items).toEqual([
      `Hand shake ±${deg2(result.altitudeStdDevRad)}°: how much the readings scattered while you sighted.`,
      `Altitude calibration ±${deg2(result.altitude.calibration.sigmaRad)}°: the uncertainty of the phone\u2019s altitude offset.`,
      'Lens and tap ±0.70°: the lens\u2019s field of view and your tap.',
    ]);
    expect(el.textContent).not.toMatch(/North|Declination/);
  });
});

describe('no component takes a bearing, an altitude or a Fix without its uncertainty (Req 13.6)', () => {
  it('is refused by the type checker', () => {
    // These lines are checked by `pnpm typecheck`: each `@ts-expect-error` fails the build if the
    // line below it starts to compile.
    // @ts-expect-error a bare azimuth is not a captured result
    const a = <CaptureSummary result={{ kind: 'bearing', azimuthRad: 1 }} />;
    // @ts-expect-error a captured bearing without its details and sigma is not accepted
    const b = <CaptureSummary result={{ kind: 'altitude', apparentAltitudeRad: 1 }} />;
    expect([a, b]).toHaveLength(2);
  });
});
