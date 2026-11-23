// The status card (Req 22.13, design D37.7, task 35.5): in Field and Field night, the tone's tint,
// a bar of 4 in the tone's bright colour, the tone's icon in its icon colour, the headline in the
// tone's ink, bold, at 20, the rest in ink at 16; in Instrument, today's block.

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FailureNotice } from './FailureNotice';
import { StatusCard, TONE_ICONS, type StatusTone } from './StatusCard';
import { applyTheme } from './theme/apply-theme';
import { field, fieldNight, instrument } from './theme/themes';
import { YawStatusBar } from './YawStatusBar';

const ROLE_OF: Record<StatusTone, string> = {
  warning: 'warn',
  danger: 'danger',
  success: 'ok',
  info: 'info',
};

const root = () => document.documentElement;
afterEach(() => {
  applyTheme(root(), instrument);
  root().removeAttribute('style');
});

function card(tone: StatusTone) {
  return render(
    <StatusCard tone={tone} headline="The phone lost the camera." testId="card">
      Tap Start to open it again.
    </StatusCard>,
  );
}

describe('StatusCard in Field and Field night (Req 22.13)', () => {
  for (const theme of [field, fieldNight]) {
    for (const tone of ['warning', 'danger', 'success', 'info'] as const) {
      it(`${theme.id}, ${tone}: tint, a bar of 4, the icon, the headline bold at 20, the rest at 16`, () => {
        applyTheme(root(), theme);
        const { getByTestId } = card(tone);
        const el = getByTestId('card');
        const r = ROLE_OF[tone];
        expect(el.style.background).toBe(`var(--alidade-${r}Tint)`);
        expect(el.style.borderLeft).toBe(`4px solid var(--alidade-${r}Bar)`);
        expect(el.style.borderRadius).toBe('var(--alidade-button-radius)');
        const icon = el.querySelector('svg');
        expect(icon?.getAttribute('data-icon')).toBe(TONE_ICONS[tone]);
        expect(icon?.getAttribute('aria-hidden')).toBe('true');
        // The icon takes the colour of its wrapper through currentColor: the tone's icon role.
        expect((icon?.parentElement as HTMLElement).style.color).toBe(`var(--alidade-${r}Icon)`);
        const headline = el.querySelector<HTMLElement>('[data-part="headline"]');
        expect(headline?.textContent).toBe('The phone lost the camera.');
        expect(headline?.style.color).toBe(`var(--alidade-${r}Ink)`);
        expect(headline?.style.fontWeight).toBe('700');
        expect(headline?.style.fontSize).toBe('20px');
        const body = el.querySelector<HTMLElement>('[data-part="body"]');
        expect(body?.textContent).toBe('Tap Start to open it again.');
        expect(body?.style.color).toBe('var(--alidade-ink)');
        expect(body?.style.fontSize).toBe('16px');
      });
    }
  }

  it('the four tones have their icons: warning, danger, success, info', () => {
    expect(TONE_ICONS).toEqual({
      warning: 'warning',
      danger: 'danger',
      success: 'success',
      info: 'info',
    });
  });

  it('is drawn again when the theme changes while it is shown', () => {
    const { getByTestId } = card('warning');
    expect(getByTestId('card').querySelector('svg')).toBeNull();
    act(() => applyTheme(root(), field));
    expect(getByTestId('card').querySelector('svg')).not.toBeNull();
    act(() => applyTheme(root(), instrument));
    expect(getByTestId('card').querySelector('svg')).toBeNull();
  });
});

describe('StatusCard in Instrument: today’s block (Req 22.13, 22.14)', () => {
  it('the card background, a rule of 3 in the alert colour, no icon, the headline a readout', () => {
    applyTheme(root(), instrument);
    const { getByTestId } = card('warning');
    const el = getByTestId('card');
    // In Instrument the tints are `panel` and the bars `alert` (D37.2): the roles give today's block.
    expect(instrument.colours.warnTint).toBe(instrument.colours.card);
    expect(instrument.colours.warnBar).toBe(instrument.colours.warnInk);
    expect(el.style.background).toBe('var(--alidade-warnTint)');
    expect(el.style.borderLeft).toBe('3px solid var(--alidade-warnBar)');
    expect(el.style.fontSize).toBe('20px');
    expect(el.querySelector('svg')).toBeNull();
    const headline = el.querySelector<HTMLElement>('[data-part="headline"]');
    expect(headline?.style.color).toBe('var(--alidade-warnInk)');
    expect(headline?.style.fontWeight).toBe('');
    const body = el.querySelector<HTMLElement>('[data-part="body"]');
    expect(body?.style.color).toBe('var(--alidade-ink)');
    expect(body?.style.fontSize).toBe('');
  });
});

describe('FailureNotice and YawStatusBar through StatusCard (Req 22.13)', () => {
  it('a Message is a warning card in Field, its whatHappened the headline, role alert kept', () => {
    applyTheme(root(), field);
    const { getByRole } = render(<FailureNotice failure={{ reason: 'camera_track_ended' }} />);
    const el = getByRole('alert');
    expect(el.getAttribute('data-testid')).toBe('failure-notice');
    expect(el.style.background).toBe('var(--alidade-warnTint)');
    expect(el.querySelector('svg')?.getAttribute('data-icon')).toBe('warning');
  });

  it('the Yaw status prompt is a warning card in Field; set north is an info card', () => {
    applyTheme(root(), field);
    const status = { status: 'none', ageMs: 0 } as const;
    const { getByTestId, rerender } = render(
      <YawStatusBar status={status} yawReference={null} frame="relative" headingSigmaRad={0.1} />,
    );
    expect(getByTestId('yaw-status').style.background).toBe('var(--alidade-warnTint)');
    // In Field the prompt is the Message's card: its first sentence the bold headline (D37.11).
    expect(getByTestId('yaw-status').querySelector('[data-part="headline"]')?.textContent).toBe(
      'The app does not yet know which way north is.',
    );
    expect(getByTestId('yaw-status').querySelector('[data-part="prompt"]')?.textContent).toBe(
      'Set north from the compass, the Sun or a landmark before taking the sighting.',
    );
    rerender(
      <YawStatusBar
        status={{ status: 'valid', ageMs: 4000 }}
        yawReference={{
          offsetRad: 0,
          sigmaRad: 0.01,
          northReference: 'true',
          frame: 'relative',
          establishedUtcMs: 0,
        }}
        frame="relative"
        headingSigmaRad={0.1}
      />,
    );
    expect(getByTestId('yaw-status').style.background).toBe('var(--alidade-infoTint)');
  });
});
