// The Sighting QR (Req 10.5, 10.6): an inline SVG drawn from the encoder's matrix, black on
// white with a quiet zone of four modules, at the width the screen allows, with the link as text
// beside it, and no image element.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QrMatrix } from '../adapters/qr-encoder';
import { QrImage, QUIET_ZONE_MODULES } from './QrImage';

/** A 21 × 21 matrix with a recognisable pattern: the diagonal and the first row dark. */
function matrix(): QrMatrix {
  const size = 21;
  const modules = Array.from({ length: size }, (_r, row) =>
    Array.from({ length: size }, (_c, column) => row === column || row === 0),
  );
  return { size, version: 1, modules };
}

const darkCount = (m: QrMatrix) => m.modules.flat().filter(Boolean).length;

describe('QrImage (Req 10.5, 10.6)', () => {
  it('draws every dark module once, inside a quiet zone of four modules', () => {
    const m = matrix();
    const { container } = render(<QrImage matrix={m} link="https://app.example.test/#X" />);
    const svg = container.querySelector('svg');
    const side = m.size + 2 * QUIET_ZONE_MODULES;
    expect(QUIET_ZONE_MODULES).toBe(4);
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${side} ${side}`);
    const background = svg?.querySelector('rect');
    expect(background?.getAttribute('fill')).toBe('#FFFFFF');
    expect(background?.getAttribute('width')).toBe(String(side));
    const d = svg?.querySelector('path')?.getAttribute('d') ?? '';
    const cells = [...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((x) => [Number(x[1]), Number(x[2])]);
    expect(cells).toHaveLength(darkCount(m));
    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(QUIET_ZONE_MODULES);
      expect(y).toBeGreaterThanOrEqual(QUIET_ZONE_MODULES);
      expect(m.modules[(y ?? 0) - QUIET_ZONE_MODULES]?.[(x ?? 0) - QUIET_ZONE_MODULES]).toBe(true);
    }
    expect(svg?.querySelector('path')?.getAttribute('fill')).toBe('#000000');
  });

  it('fills the width it is given, keeps its square and has no image element', () => {
    const { container } = render(<QrImage matrix={matrix()} link="https://app.example.test/#X" />);
    const svg = container.querySelector('svg');
    expect(svg?.style.width).toBe('100%');
    expect(svg?.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('shows the link as text beside the code', () => {
    const { getByTestId } = render(
      <QrImage matrix={matrix()} link="https://app.example.test/#32ABC" />,
    );
    expect(getByTestId('qr-link').textContent).toBe('https://app.example.test/#32ABC');
  });
});
