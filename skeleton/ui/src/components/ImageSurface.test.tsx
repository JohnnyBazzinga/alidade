import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeObserver } from '../test-support/fake-observe';
import { ImageSurface, type ImageSurfaceProps } from './ImageSurface';

const SOURCE = { widthSourcePx: 720, heightSourcePx: 1280 };

function setup(over: Partial<ImageSurfaceProps> = {}) {
  const onMark = vi.fn();
  const onAim = vi.fn();
  const observer = fakeObserver({ widthPx: 390, heightPx: 844 });
  const utils = render(
    <ImageSurface
      frozen={false}
      sourceSize={SOURCE}
      fit="cover"
      mark={null}
      onMark={onMark}
      onAim={onAim}
      observe={observer.observe}
      {...over}
    >
      {(layout) => <span data-testid="child">{layout === null ? 'none' : 'layout'}</span>}
    </ImageSurface>,
  );
  return {
    ...utils,
    onMark,
    onAim,
    observer,
    surface: within(utils.container).getByTestId('image-surface'),
  };
}

describe('ImageSurface (Req 13.8, 17.10, 17.11, design D22)', () => {
  it('gives its children the layout once the size is known and draws the Reticle', () => {
    const { getByTestId } = setup();
    expect(getByTestId('child').textContent).toBe('layout');
    expect(getByTestId('reticle')).toBeTruthy();
  });

  it('gives no layout without a source size', () => {
    const { getByTestId } = setup({ sourceSize: null });
    expect(getByTestId('child').textContent).toBe('none');
  });

  it('while frozen, a tap marks the point where the pointer lifted, with the layout', () => {
    const { surface, onMark, onAim } = setup({ frozen: true });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 200 });
    expect(onMark).toHaveBeenCalledTimes(1);
    expect(onMark.mock.calls[0]?.[0]).toEqual({ xPx: 100, yPx: 200 });
    expect(onMark.mock.calls[0]?.[1].elementWidthPx).toBe(390);
    expect(onAim).not.toHaveBeenCalled();
  });

  it('while frozen, a drag does not aim and the mark is where the finger lifts', () => {
    const { surface, onMark, onAim } = setup({ frozen: true });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 140, clientY: 230 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 150, clientY: 240 });
    expect(onAim).not.toHaveBeenCalled();
    expect(onMark.mock.calls[0]?.[0]).toEqual({ xPx: 150, yPx: 240 });
  });

  it('while not frozen, a drag aims with the movement since the last event and does not mark', () => {
    const { surface, onMark, onAim } = setup();
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 130, clientY: 190 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 135, clientY: 190 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 135, clientY: 190 });
    expect(onAim.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'drag', dxPx: 30, dyPx: -10 },
      { kind: 'drag', dxPx: 5, dyPx: 0 },
    ]);
    expect(onMark).not.toHaveBeenCalled();
  });

  it('ignores a second finger', () => {
    const { surface, onMark } = setup({ frozen: true });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(surface, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 300, clientY: 300 });
    expect(onMark).not.toHaveBeenCalled();
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(onMark).toHaveBeenCalledTimes(1);
  });

  it('a cancelled pointer marks nothing', () => {
    const { surface, onMark } = setup({ frozen: true });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(surface, { pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(onMark).not.toHaveBeenCalled();
  });

  it('the arrow keys aim one step each way while not frozen, and not while frozen', () => {
    const { surface, onAim } = setup();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    fireEvent.keyDown(surface, { key: 'ArrowUp' });
    fireEvent.keyDown(surface, { key: 'ArrowDown' });
    fireEvent.keyDown(surface, { key: 'a' });
    expect(onAim.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'key', azimuthSteps: 1, altitudeSteps: 0 },
      { kind: 'key', azimuthSteps: -1, altitudeSteps: 0 },
      { kind: 'key', azimuthSteps: 0, altitudeSteps: 1 },
      { kind: 'key', azimuthSteps: 0, altitudeSteps: -1 },
    ]);
    const frozen = setup({ frozen: true });
    fireEvent.keyDown(frozen.surface, { key: 'ArrowRight' });
    expect(frozen.onAim).not.toHaveBeenCalled();
  });

  it('with no onAim (the camera) a drag and the keys do nothing', () => {
    const { surface } = setup({ onAim: undefined });
    expect(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 1, clientY: 1 });
      fireEvent.pointerMove(surface, { pointerId: 1, clientX: 9, clientY: 9 });
      fireEvent.keyDown(surface, { key: 'ArrowUp' });
    }).not.toThrow();
  });

  it('draws the Mark from its offset and moves it when the Element is resized', () => {
    const mark = {
      offset: { rightRad: 0.1, upRad: 0.05 },
      imageSigmaRad: 0.01,
      calibration: {
        fovRad: 1.2,
        fovAxis: 'diagonal' as const,
        fovSigmaRad: 0.02,
        imageWidthSourcePx: 720,
        imageHeightSourcePx: 1280,
      },
    };
    const { getByTestId, observer } = setup({ mark });
    const left = getByTestId('mark-ring').style.left;
    observer.resize({ widthPx: 780, heightPx: 1688 });
    expect(getByTestId('mark-ring').style.left).not.toBe(left);
  });

  it('stops observing when unmounted', () => {
    const { unmount, observer } = setup();
    expect(observer.listeners()).toBe(1);
    unmount();
    expect(observer.listeners()).toBe(0);
  });
});

// Req 22.10 (2026-11-22, the lead's new look): the camera's frame. Four corner brackets, each an L of
// two arms of 24, a core of 3 over an outline of 1 on each side, in the constant roles of the
// Reticle, inside the element, decorative, clear of the centre; the radius of the theme.
describe('ImageSurface, the camera’s frame (Req 22.10)', () => {
  const brackets = (surface: HTMLElement) => [
    ...surface.querySelectorAll<HTMLElement>('[data-part="bracket"]'),
  ];

  it('has the theme’s image radius, which clips the image', () => {
    const { surface } = setup();
    expect(surface.style.borderRadius).toBe('var(--alidade-image-radius)');
    expect(surface.style.overflow).toBe('hidden');
  });

  it('draws four brackets, one in each corner, decorative and never in the way of a tap', () => {
    const { surface } = setup();
    const layer = surface.querySelector<HTMLElement>('[data-part="brackets"]');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.style.pointerEvents).toBe('none');
    expect(layer?.style.position).toBe('absolute');
    expect(layer?.style.inset).toBe('0px');
    const all = brackets(surface);
    expect(all.map((b) => b.dataset.corner).sort()).toEqual(['bl', 'br', 'tl', 'tr']);
    for (const b of all) {
      expect(b.style.pointerEvents).toBe('none');
      expect(b.style.position).toBe('absolute');
      expect(b.style.width).toBe('24px');
      expect(b.style.height).toBe('24px');
      const arms = [...b.querySelectorAll<HTMLElement>('[data-part="arm"]')];
      expect(arms).toHaveLength(2);
      const lengths = arms.map((a) => [a.style.width, a.style.height].sort().join(' '));
      expect(lengths).toEqual(['24px 3px', '24px 3px']);
      for (const a of arms) {
        // Light over a dark outline (amended 2026-11-23, Codex's comparison with the references):
        // the crosshair is the one gold mark on the image.
        expect(a.style.background).toBe('var(--alidade-mapInk)');
        expect(a.style.boxShadow).toBe('0 0 0 1px var(--alidade-reticleOutline)');
      }
    }
  });

  it('lies inside the element, at least 32 from its centre at the smallest image (351 by 160)', () => {
    const { surface } = setup();
    const widthPx = 351;
    const heightPx = 160;
    for (const b of brackets(surface)) {
      const corner = b.dataset.corner ?? '';
      const insetX = Number.parseFloat(corner.endsWith('l') ? b.style.left : b.style.right);
      const insetY = Number.parseFloat(corner.startsWith('t') ? b.style.top : b.style.bottom);
      expect(insetX).toBeGreaterThanOrEqual(1);
      expect(insetY).toBeGreaterThanOrEqual(1);
      // The bracket's point nearest the centre is its inner corner, `inset + 24` from the edges.
      const dx = widthPx / 2 - (insetX + 24);
      const dy = heightPx / 2 - (insetY + 24);
      expect(Math.hypot(Math.max(dx, 0), Math.max(dy, 0))).toBeGreaterThanOrEqual(32);
    }
  });

  it('keeps the Reticle and the Mark above the brackets, unchanged', () => {
    const { surface, getByTestId } = setup();
    const children = [...surface.children];
    const layer = surface.querySelector('[data-part="brackets"]') as Element;
    expect(children.indexOf(layer)).toBeLessThan(children.indexOf(getByTestId('reticle')));
  });
});
