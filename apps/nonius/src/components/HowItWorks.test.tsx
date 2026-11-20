// "How it works" (Req 4.7, 12.2, 9.2).

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  const onBack = vi.fn();
  const { container } = render(<HowItWorks onBack={onBack} />);
  const text = container.textContent ?? '';

  it('says what the app corrects for and what it does not (Req 4.7)', () => {
    expect(text).toContain('refraction');
    expect(text).toContain('Bennett');
    expect(text).toMatch(/no dip/i);
    expect(text).toMatch(/no semi-diameter/i);
    expect(text).toMatch(/no parallax/i);
  });

  it('names the sources of the Sun’s position and of the refraction formula', () => {
    expect(text).toContain('astronomy-engine');
    expect(text).toContain('Meeus');
  });

  it('says what is stored, and that sights and times are enough to work out where they were taken (Req 12.2)', () => {
    expect(text).toContain('Only your sights');
    expect(text).toContain('enough for anyone to work out where they were taken');
    expect(text).toContain('No position is stored');
  });

  it('states the limits in the words of Req 9.2, and that no GPS is used for the position', () => {
    expect(text).toContain('111 km');
    expect(text).toContain('backup and a teaching instrument');
    expect(text).toContain('No GPS is used for the position');
  });

  it('has a Back control', () => {
    const { getByRole } = render(<HowItWorks onBack={onBack} />);
    fireEvent.click(getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
