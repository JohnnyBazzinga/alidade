import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Reticle } from './Reticle';

const px = (v: string | undefined): number => Number.parseFloat(v ?? 'NaN');

function parts() {
  const { container } = render(<Reticle />);
  const arms = [...container.querySelectorAll<HTMLElement>('[data-part]')];
  return (part: string, side: string) => {
    const el = arms.find((a) => a.dataset.part === part && a.dataset.side === side);
    if (el === undefined) throw new Error(`${part} ${side}`);
    return {
      left: px(el.style.left),
      top: px(el.style.top),
      width: px(el.style.width),
      height: px(el.style.height),
      background: el.style.background,
    };
  };
}

describe('Reticle (Req 13.1, 13.12)', () => {
  it('has a core line of at least 2 CSS px on every arm', () => {
    const get = parts();
    expect(get('core', 'left').height).toBeGreaterThanOrEqual(2);
    expect(get('core', 'right').height).toBeGreaterThanOrEqual(2);
    expect(get('core', 'top').width).toBeGreaterThanOrEqual(2);
    expect(get('core', 'bottom').width).toBeGreaterThanOrEqual(2);
  });

  it('has an outline of at least 1 CSS px on each side of the core', () => {
    const get = parts();
    for (const side of ['left', 'right']) {
      const outer = get('outline', side);
      const core = get('core', side);
      expect(core.top - outer.top).toBeGreaterThanOrEqual(1);
      expect(outer.top + outer.height - (core.top + core.height)).toBeGreaterThanOrEqual(1);
    }
    for (const side of ['top', 'bottom']) {
      const outer = get('outline', side);
      const core = get('core', side);
      expect(core.left - outer.left).toBeGreaterThanOrEqual(1);
      expect(outer.left + outer.width - (core.left + core.width)).toBeGreaterThanOrEqual(1);
    }
  });

  it('leaves a clear gap of at least 8 CSS px at the centre', () => {
    const get = parts();
    const horizontal =
      get('outline', 'right').left - (get('outline', 'left').left + get('outline', 'left').width);
    const vertical =
      get('outline', 'bottom').top - (get('outline', 'top').top + get('outline', 'top').height);
    expect(horizontal).toBeGreaterThanOrEqual(8);
    expect(vertical).toBeGreaterThanOrEqual(8);
  });

  it('draws the core light and the outline dark (two tones)', () => {
    const get = parts();
    expect(get('core', 'left').background).not.toBe(get('outline', 'left').background);
  });

  it('is centred on the Element and does not take pointer events', () => {
    const { getByTestId } = render(<Reticle />);
    const el = getByTestId('reticle');
    expect(el.style.left).toBe('50%');
    expect(el.style.top).toBe('50%');
    expect(el.style.pointerEvents).toBe('none');
  });
});
