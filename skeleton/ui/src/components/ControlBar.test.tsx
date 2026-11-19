import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlBar } from './ControlBar';

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
