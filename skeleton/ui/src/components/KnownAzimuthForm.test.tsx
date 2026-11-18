import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { messageFor } from '../math/messages';
import { KnownAzimuthForm } from './KnownAzimuthForm';

function setup() {
  const onSubmit = vi.fn();
  const utils = render(<KnownAzimuthForm onSubmit={onSubmit} />);
  const type = (label: RegExp, value: string) =>
    fireEvent.change(utils.getByLabelText(label), { target: { value } });
  return {
    ...utils,
    onSubmit,
    type,
    press: () => fireEvent.click(utils.getByText('Set north from this azimuth')),
  };
}

describe('KnownAzimuthForm (Req 11.1, 18.4)', () => {
  it('sends the azimuth and the 1-sigma in radians with the North reference', () => {
    const { type, press, onSubmit } = setup();
    type(/Known azimuth/, '200.5°');
    type(/1-sigma/, '0.5');
    press();
    const sent = onSubmit.mock.calls[0]?.[0];
    expect(sent.kind).toBe('knownAzimuth');
    expect(sent.azimuthRad).toBeCloseTo((200.5 * Math.PI) / 180, 12);
    expect(sent.sigmaRad).toBeCloseTo((0.5 * Math.PI) / 180, 12);
    expect(sent.northReference).toBe('true');
  });

  it('can be measured from magnetic north', () => {
    const { type, press, onSubmit, getByLabelText } = setup();
    fireEvent.change(getByLabelText(/Measured from/), { target: { value: 'magnetic' } });
    type(/Known azimuth/, '10');
    type(/1-sigma/, '1');
    press();
    expect(onSubmit.mock.calls[0]?.[0].northReference).toBe('magnetic');
  });

  for (const [azimuth, sigma] of [
    ['', '1'],
    ['abc', '1'],
    ['10', ''],
    ['10', '1e3'],
  ] as const) {
    it(`refuses azimuth "${azimuth}" with sigma "${sigma}" with the Message of invalid_number`, () => {
      const { type, press, onSubmit, getByRole } = setup();
      type(/Known azimuth/, azimuth);
      type(/1-sigma/, sigma);
      press();
      expect(onSubmit).not.toHaveBeenCalled();
      const m = messageFor({ ok: false, reason: 'invalid_number' });
      expect(getByRole('alert').textContent).toBe(m.whatHappened + m.whatToDo);
    });
  }

  it('makes its fields and button at least 48 CSS px tall', () => {
    const { container } = setup();
    for (const el of container.querySelectorAll<HTMLElement>('input, select, button')) {
      expect(Number.parseFloat(el.style.height || el.style.minHeight)).toBeGreaterThanOrEqual(48);
    }
  });
});
