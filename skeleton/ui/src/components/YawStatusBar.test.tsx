import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { YawStatusBar, formatAge } from './YawStatusBar';

const REF = {
  offsetRad: 0.1,
  sigmaRad: (0.4 * Math.PI) / 180,
  northReference: 'true' as const,
  frame: 'relative' as const,
  establishedUtcMs: 0,
};
const HEADING = (2 * Math.PI) / 180;
const text = (r: 'no_yaw_reference' | 'stale_yaw_reference' | 'frame_reset') => {
  const m = messageFor({ ok: false, reason: r });
  return `${m.whatHappened} ${m.whatToDo}`;
};

describe('YawStatusBar (Req 11.4)', () => {
  it('none, Relative frame: says north is not set and prompts with the Message of no_yaw_reference', () => {
    const { getByTestId } = render(
      <YawStatusBar
        status={{ status: 'none', ageMs: 0 }}
        yawReference={null}
        frame="relative"
        headingSigmaRad={HEADING}
      />,
    );
    const bar = getByTestId('yaw-status');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe('North is not set.');
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(text('no_yaw_reference'));
  });

  it('valid: shows the age, the North reference and the 1-sigma, and no prompt', () => {
    const { getByTestId } = render(
      <YawStatusBar
        status={{ status: 'valid', ageMs: 42_000 }}
        yawReference={REF}
        frame="relative"
        headingSigmaRad={HEADING}
      />,
    );
    const bar = getByTestId('yaw-status');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe(
      'North set 42 s ago, true north, ±0.4°.',
    );
    expect(bar.querySelector('[data-part="prompt"]')).toBeNull();
  });

  it('stale: prompts with the Message of stale_yaw_reference', () => {
    const { getByTestId } = render(
      <YawStatusBar
        status={{ status: 'stale', ageMs: 130_000 }}
        yawReference={REF}
        frame="relative"
        headingSigmaRad={HEADING}
      />,
    );
    const bar = getByTestId('yaw-status');
    expect(bar.dataset.status).toBe('stale');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toContain('2 min ago');
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(
      text('stale_yaw_reference'),
    );
  });

  it('invalidated: says north was lost and prompts with the Message of frame_reset', () => {
    const { getByTestId } = render(
      <YawStatusBar
        status={{ status: 'invalidated', ageMs: 5000 }}
        yawReference={REF}
        frame="relative"
        headingSigmaRad={HEADING}
      />,
    );
    const bar = getByTestId('yaw-status');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe(
      'North set 5 s ago was lost.',
    );
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(text('frame_reset'));
  });

  it('none, Absolute frame: north comes from the phone\u2019s compass, with the heading 1-sigma (Req 11.4)', () => {
    const { getByTestId } = render(
      <YawStatusBar
        status={{ status: 'none', ageMs: 0 }}
        yawReference={null}
        frame="absolute"
        headingSigmaRad={HEADING}
      />,
    );
    const bar = getByTestId('yaw-status');
    expect(bar.dataset.status).toBe('none');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe(
      'North comes from the phone\u2019s compass, 1-sigma ±2.0°.',
    );
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(
      'Setting north on the Sun or a landmark reduces the error.',
    );
    expect(bar.textContent).not.toContain('not set');
    expect(bar.textContent).not.toContain(
      messageFor({ ok: false, reason: 'no_yaw_reference' }).whatHappened,
    );
  });

  it('none with no sample yet: the Relative wording, which claims no north', () => {
    const { getByTestId } = render(
      <YawStatusBar
        status={{ status: 'none', ageMs: 0 }}
        yawReference={null}
        frame={null}
        headingSigmaRad={HEADING}
      />,
    );
    expect(getByTestId('yaw-status').querySelector('[data-part="prompt"]')?.textContent).toBe(
      text('no_yaw_reference'),
    );
  });

  it('formats ages', () => {
    expect(formatAge(0)).toBe('0 s');
    expect(formatAge(119_400)).toBe('119 s');
    expect(formatAge(120_000)).toBe('2 min');
    expect(formatAge(-5)).toBe('0 s');
  });
});
