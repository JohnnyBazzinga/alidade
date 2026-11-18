import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { imageLayout } from '../math/image-layout';
import { pointToRayOffset } from '../math/image-geometry';
import { FIXTURE_CALIBRATION } from '../test-support/session-fixtures';
import { MarkRing } from './MarkRing';

function layoutFor(widthPx: number, heightPx: number) {
  const l = imageLayout(
    { widthSourcePx: 720, heightSourcePx: 1280 },
    { widthPx, heightPx },
    'cover',
  );
  if (!l.ok) throw new Error('layout');
  return l.value;
}

describe('MarkRing (Req 13.3, 13.12)', () => {
  const small = layoutFor(390, 844);
  const offset = pointToRayOffset(small, FIXTURE_CALIBRATION, { xPx: 100, yPx: 300 });
  if (!offset.ok) throw new Error('offset');
  const mark = { offset: offset.value, imageSigmaRad: 0.01, calibration: FIXTURE_CALIBRATION };

  it('is at least 24 CSS px across and centred on the point of its offset', () => {
    const { getByTestId } = render(<MarkRing mark={mark} layout={small} />);
    const el = getByTestId('mark-ring');
    const size = Number.parseFloat(el.style.width);
    expect(size).toBeGreaterThanOrEqual(24);
    expect(Number.parseFloat(el.style.left) + size / 2).toBeCloseTo(100, 6);
    expect(Number.parseFloat(el.style.top) + size / 2).toBeCloseTo(300, 6);
  });

  it('has two tones, a dark outline round a light core', () => {
    const { getByTestId } = render(<MarkRing mark={mark} layout={small} />);
    const outer = getByTestId('mark-ring');
    const core = outer.querySelector<HTMLElement>('[data-part="core"]');
    expect(outer.style.border).toContain('1px');
    expect(core?.style.border).toContain('2px');
    expect(outer.style.border).not.toBe(core?.style.border);
  });

  it('is drawn again at the new point when the Element changes size', () => {
    const big = layoutFor(780, 1688);
    const { getByTestId, rerender } = render(<MarkRing mark={mark} layout={small} />);
    const before = Number.parseFloat(getByTestId('mark-ring').style.left);
    rerender(<MarkRing mark={mark} layout={big} />);
    const el = getByTestId('mark-ring');
    const size = Number.parseFloat(el.style.width);
    // The same offset on an Element twice the size is twice as far from the centre.
    expect(Number.parseFloat(el.style.left) + size / 2).toBeCloseTo(200, 6);
    expect(Number.parseFloat(el.style.left)).not.toBe(before);
  });

  it('draws a Mark tapped at the corner of the Element (found by the Playground test)', () => {
    // The Session accepts a point on the edge (Req 5.4 allows 1e-9 px); the round trip of its
    // offset lands a few ulps outside the Element, and the ring must still be drawn.
    const corner = pointToRayOffset(small, FIXTURE_CALIBRATION, { xPx: 0, yPx: 0 });
    if (!corner.ok) throw new Error('corner');
    const atCorner = { ...mark, offset: corner.value };
    const { getByTestId } = render(<MarkRing mark={atCorner} layout={small} />);
    const el = getByTestId('mark-ring');
    const size = Number.parseFloat(el.style.width);
    expect(Number.parseFloat(el.style.left) + size / 2).toBeCloseTo(0, 6);
    expect(Number.parseFloat(el.style.top) + size / 2).toBeCloseTo(0, 6);
  });

  it('draws nothing for an offset that falls outside the Element', () => {
    const wide = { ...mark, offset: { rightRad: 1.3, upRad: 0 } };
    const { queryByTestId } = render(<MarkRing mark={wide} layout={small} />);
    expect(queryByTestId('mark-ring')).toBeNull();
  });
});
