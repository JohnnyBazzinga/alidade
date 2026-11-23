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

// Req 13.16 (2026-11-21): the compact form.
describe('CaptureSummary, compact (Req 13.16, 13.6)', () => {
  it('keeps the headline with its sigma; the list and the limits are under "Why this accuracy?"', () => {
    const result = captured('bearing');
    const { getByTestId } = render(<CaptureSummary result={result} compact />);
    const el = getByTestId('capture-summary');
    expect(el.querySelector('[data-part="headline"]')?.textContent).toMatch(/1-sigma ±/);
    const details = el.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Why this accuracy?');
    expect(details.querySelector('[data-part="made-of"]')).not.toBeNull();
    expect(details.querySelector('[data-testid="limits-note"]')).not.toBeNull();
    expect(el.querySelector('[data-part="headline"]')?.closest('details')).toBeNull();
  });

  it('without compact has no disclosure', () => {
    const { getByTestId } = render(<CaptureSummary result={captured('altitude')} />);
    expect(getByTestId('capture-summary').querySelector('details')).toBeNull();
  });
});

// Req 22.12 (2026-11-22): the headline's sigma has a rounding that the caller may choose.
describe('CaptureSummary, the sigma of its headline (Req 22.12)', () => {
  it('uses the function it is given for the headline’s sigma, and only there', () => {
    const result = captured('bearing');
    const { getByTestId } = render(
      <CaptureSummary
        result={result}
        sigmaText={(rad) => `±${Math.ceil((rad * 1800) / Math.PI) / 10}° up`}
      />,
    );
    const headline = getByTestId('capture-summary').querySelector('[data-part="headline"]');
    expect(headline?.textContent).toMatch(/1-sigma ±\d+(\.\d)?° up$/);
    expect(
      getByTestId('capture-summary').querySelector('[data-part="made-of"]')?.textContent,
    ).not.toContain('up');
  });

  it('without it, the headline is as before', () => {
    const result = captured('bearing');
    const a = render(<CaptureSummary result={result} />);
    const before = a
      .getByTestId('capture-summary')
      .querySelector('[data-part="headline"]')?.textContent;
    expect(before).toMatch(/^Bearing \d+\.\d° true, 1-sigma ±\d+\.\d°$/);
    a.unmount();
    const b = render(<CaptureSummary result={captured('altitude')} />);
    expect(
      b.getByTestId('capture-summary').querySelector('[data-part="headline"]')?.textContent,
    ).toMatch(/^Altitude -?\d+\.\d°, 1-sigma ±\d+\.\d°$/);
  });
});

// Vigia task 24.6: a caller that writes the headline itself (Vigia's Bearing card) hides this one;
// "Why this accuracy?" and what is in it stay.
describe('CaptureSummary without its headline', () => {
  it('leaves the headline out and keeps the disclosure', () => {
    const { getByTestId } = render(
      <CaptureSummary result={captured('bearing')} compact showHeadline={false} />,
    );
    const el = getByTestId('capture-summary');
    expect(el.querySelector('[data-part="headline"]')).toBeNull();
    expect(el.querySelector('summary')?.textContent).toBe('Why this accuracy?');
  });
});
