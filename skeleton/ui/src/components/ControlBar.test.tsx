import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlBar, controlStyle } from './ControlBar';

describe('ControlBar (Req 13.7, 13.12)', () => {
  const run = () => {
    const onPress = vi.fn();
    const utils = render(
      <ControlBar
        controls={[
          { id: 'freeze', label: 'Freeze', primary: true, onPress },
          { id: 'other', label: 'Other', onPress },
        ]}
      />,
    );
    return { ...utils, onPress };
  };

  it('makes every control at least 48 × 48 CSS px', () => {
    const { container } = run();
    for (const b of container.querySelectorAll('button')) {
      expect(Number.parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(48);
      expect(Number.parseFloat(b.style.minWidth)).toBeGreaterThanOrEqual(48);
    }
  });

  it('makes the primary controls at least 64 CSS px tall', () => {
    const { container } = run();
    const primary = container.querySelector<HTMLElement>('[data-control="freeze"]');
    expect(Number.parseFloat(primary?.style.height ?? '0')).toBeGreaterThanOrEqual(64);
    expect(Number.parseFloat(primary?.style.minHeight ?? '0')).toBeGreaterThanOrEqual(64);
  });

  it('leaves at least 8 CSS px between neighbours and sits in the lower part', () => {
    const { getByTestId } = run();
    const bar = getByTestId('control-bar');
    expect(Number.parseFloat(bar.style.gap)).toBeGreaterThanOrEqual(8);
    expect(bar.dataset.placement).toBe('lower');
    // Req 13.13 (amendment of 2026-11-19): in the normal flow, not held over the content.
    expect(['', 'static', 'relative']).toContain(bar.style.position);
  });

  it('calls the handler of the control pressed and renders nothing for no controls', () => {
    const { getByText, onPress } = run();
    fireEvent.click(getByText('Other'));
    expect(onPress).toHaveBeenCalledTimes(1);
    const empty = render(<ControlBar controls={[]} />);
    expect(empty.container.innerHTML).toBe('');
  });
});

// Req 22.4, 22.7 (2026-11-22, the lead's new look): a control's colours and shape are roles and
// shapes of the theme. In Instrument the primary fill is the flat brass and the radius 0, as before.
describe('controlStyle as roles and shapes (Req 22.4, 22.7)', () => {
  it('the primary: the primary fill (a gradient where the theme has one), its ink, the button radius', () => {
    const s = controlStyle(true);
    expect(s.background).toBe('var(--alidade-primary-fill)');
    expect(s.color).toBe('var(--alidade-primaryInk)');
    expect(s.border).toBe('1px solid var(--alidade-primary)');
    expect(s.borderRadius).toBe('var(--alidade-button-radius)');
  });

  it('the others: raised, in ink, with an outline that carries meaning (ruleStrong, 3:1)', () => {
    // The theme's control fill and edge (Req 22.16): raised and 1 in every theme but Mira.
    const s = controlStyle(false);
    expect(s.background).toBe('var(--alidade-control-fill, var(--alidade-raised))');
    expect(s.color).toBe('var(--alidade-ink)');
    expect(s.border).toBe('var(--alidade-control-edge, 1px) solid var(--alidade-ruleStrong)');
    expect(s.borderRadius).toBe('var(--alidade-button-radius)');
  });

  it('keeps the sizes of Req 13.7', () => {
    expect(controlStyle(true).minHeight).toBe(64);
    expect(controlStyle(false).minHeight).toBe(48);
    expect(controlStyle(false).fontSize).toBe(20);
  });
});

// Task 24.5 (Vigia Req 22.8): a control may carry an icon, chosen by the application, beside its
// word; the word stays its name.
describe('a control with its icon (Req 22.8, 22.11)', () => {
  it('draws the icon before the word, hidden, and keeps the word as the name', () => {
    const { getByRole } = render(
      <ControlBar
        controls={[
          { id: 'capture', label: 'Capture', primary: true, icon: 'camera', onPress: vi.fn() },
          { id: 'unfreeze', label: 'Back to live', onPress: vi.fn() },
        ]}
      />,
    );
    const capture = getByRole('button', { name: 'Capture' });
    expect(capture.firstElementChild?.getAttribute('data-icon')).toBe('camera');
    expect(capture.style.display).toBe('inline-flex');
    expect(getByRole('button', { name: 'Back to live' }).querySelector('svg')).toBeNull();
  });
});
