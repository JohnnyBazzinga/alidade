// The Sight screen (design §9, D23; Req 3.1, 3.3, 3.7, 3.10, 4.2, 4.3, 16.2), as amended 2026-11-21
// (task 23.4, 23.5): UI's docked sighting screen through `DeviceSighting` on a phone (crosshair only,
// no calibration), one aiming line and "How to aim", no instruction to tap, a capture with no smoke
// open that starts the smoke with no question, and with one open a question that is a view of its
// own, preselected only within the maximum Incident age.

import type { Session } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import {
  AIM_LINE_TEXT,
  SIMULATION_VALUES_TEXT,
  sightingGuidance,
  TWO_SMOKES_TEXT,
} from '../math/texts';
import { mountDeviceSight as mount } from '../test-support/device-sight';
import { createFakeEnvironment, recordingSightingSource } from '../test-support/fake-environment';
import { postsIncident } from '../test-support/geometry-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { SightScreen } from './SightScreen';

const calibrationMissing = () => {
  const m = messageFor({ ok: false, reason: 'calibration_missing' });
  return `${m.whatHappened}${m.whatToDo}`;
};

describe('SightScreen on a phone (Req 3.1, 3.3)', () => {
  it('is UI\u2019s sighting screen with the rear camera, started by the one tap', async () => {
    const s = mount();
    await s.settle();
    expect(s.getByTestId('sighting-screen').dataset.state).toBe('permission');
    await s.press('start');
    expect(s.camera.calls).toEqual([
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
    ]);
  });

  // Requirement change (Vigia 3.3 and UI 18.10, amended 2026-11-21, the lead's decision on U17): on a
  // phone the image takes no taps and shows no Message; this test used to expect `calibration_missing`.
  it('sights along the crosshair only: a tap on the frozen image does nothing and says nothing', async () => {
    const s = mount();
    await s.settle();
    await s.press('start');
    await s.advance(1500);
    await s.press('freeze');
    const surface = s.getByTestId('image-surface');
    await s.settle(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    });
    expect(s.queryAllByRole('alert').map((a) => a.textContent)).not.toContain(calibrationMissing());
    expect(s.queryByTestId('mark-ring')).toBeNull();
  });

  it('has Back as a control of its own', async () => {
    const s = mount();
    await s.settle();
    fireEvent.click(s.getByRole('button', { name: 'Back' }));
    expect(s.calls).toEqual(['back']);
  });
});

describe('the aiming line and "How to aim" (Req 3.7, 16.2)', () => {
  it('shows one line, and every statement of the guidance in a closed disclosure', async () => {
    const s = mount();
    await s.settle();
    const guidance = s.getByTestId('guidance');
    const details = guidance.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary') as HTMLElement;
    expect(summary.textContent).toContain(AIM_LINE_TEXT);
    expect(summary.textContent).toContain('How to aim');
    for (const sentence of sightingGuidance(false)) {
      expect(details.textContent).toContain(sentence);
      expect(summary.textContent).not.toContain(sentence);
    }
    expect(guidance.parentElement?.getAttribute('data-part')).toBe('middle');
    expect(Number.parseFloat(summary.style.minHeight)).toBeGreaterThanOrEqual(48);
  });

  it('adds the wind sentence only when a wind reading is shown', async () => {
    const s = mount({ windShown: true });
    await s.settle();
    for (const sentence of sightingGuidance(true)) {
      expect(s.getByTestId('guidance').textContent).toContain(sentence);
    }
  });

  it('is in every state of the screen, and says nothing of tapping the image on a phone', async () => {
    const s = mount();
    await s.settle();
    expect(s.getByTestId('guidance')).toBeTruthy();
    await s.toLive();
    expect(s.getByTestId('guidance')).toBeTruthy();
    await s.press('freeze');
    expect(s.getByTestId('guidance')).toBeTruthy();
    expect(s.getByTestId('sight-screen').textContent).not.toMatch(/Tap the image|No mark|Mark set/);
  });
});

describe('a capture with no smoke open starts the smoke (Req 4.2, 4.11)', () => {
  it('adds the sighting to a new smoke at once, with no question, and says where it went', async () => {
    const s = mount();
    await s.captureOnCrosshair();
    expect(s.queryByTestId('confirm-smoke')).toBeNull();
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.entries()).toBe(1);
    const id = s.store.getSnapshot().open?.incident.entries[0]?.sighting.sightingId;
    expect(s.calls).toEqual([`added:${id}`]);
  });

  it('shows the refusal of the store in a view with a way back to the sighting, and adds nothing', async () => {
    const s = mount({ extra: { randomAvailable: false } });
    await s.captureOnCrosshair();
    const m = messageFor({ ok: false, reason: 'random_unavailable' });
    expect(s.getByRole('alert').textContent).toBe(`${m.whatHappened} ${m.whatToDo}`);
    expect(s.store.getSnapshot().state.incidents).toHaveLength(0);
    expect(s.calls).toEqual([]);
    fireEvent.click(s.getByRole('button', { name: 'Back to the sighting' }));
    // The camera was released while the Message showed: the way back is a fresh Start.
    expect(s.getByTestId('sighting-screen').dataset.state).toBe('permission');
  });
});

describe('the question with a smoke open is a view of its own (Req 4.3)', () => {
  it('replaces the camera and the readout; no "Take another" anywhere; the answers fully visible', async () => {
    const s = mount({ stored: storedWith([postsIncident(['west', 'east'])]) });
    await s.captureOnCrosshair();
    expect(s.queryByTestId('sighting-screen')).toBeNull();
    expect(s.queryByTestId('image-surface')).toBeNull();
    expect(s.queryByRole('button', { name: 'Take another' })).toBeNull();
    const dialog = s.getByTestId('confirm-smoke');
    expect(dialog.textContent).toContain('Is this the same smoke as before?');
    expect(dialog.textContent).toContain(TWO_SMOKES_TEXT);
    const same = within(dialog).getByRole('button', { name: 'The same smoke' });
    const other = within(dialog).getByRole('button', { name: 'A different smoke' });
    // Requirement change (Req 4.3 as amended 2026-11-22, Req 22.1 (d), 22.9): neither answer is
    // preselected; the two are of one style, at least 64, each with its icon.
    for (const b of [same, other]) {
      expect(b.dataset.preselected).toBeUndefined();
      expect(b.dataset.primary).toBeUndefined();
      expect(Number.parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(64);
      expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(same.getAttribute('style')).toBe(other.getAttribute('style'));
    expect(s.entries()).toBe(2);
  });

  it('puts the breakdown of the bearing under "Why this accuracy?", below the answers', async () => {
    const s = mount({ stored: storedWith([postsIncident(['west', 'east'])]) });
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    const why = dialog.querySelector('details') as HTMLDetailsElement;
    expect(why.open).toBe(false);
    expect(why.querySelector('summary')?.textContent).toBe('Why this accuracy?');
    expect(why.querySelector('[data-part="made-of"]')).not.toBeNull();
    const buttons = [...dialog.querySelectorAll('button')];
    const same = buttons.find((b) => b.textContent === 'The same smoke') as HTMLElement;
    expect(same.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    // The bearing's own 1-sigma stays visible, outside the disclosure (Req 13.6), labelled
    // (Req 22.9, a requirement change: the card's labels replace the summary's headline).
    const card = s.getByTestId('bearing-card');
    expect(card.querySelector('[data-part="sigma-label"]')?.textContent).toBe(
      'Uncertainty (1-sigma)',
    );
    expect(card.querySelector('[data-part="sigma-value"]')?.textContent).toMatch(/^±\d+\.\d°$/);
    expect(card.querySelector('[data-part="bearing-label"]')?.textContent).toBe('Bearing');
    expect(card.querySelector('[data-part="bearing-value"]')?.textContent).toMatch(
      /^\d+\.\d° true$/,
    );
    expect(why.closest('details')?.compareDocumentPosition(card) ?? 0).not.toBe(0);
  });

  it('"the same smoke" adds it to the open smoke, and nothing was added before the tap', async () => {
    const s = mount({ stored: storedWith([postsIncident(['west', 'east'])]) });
    await s.captureOnCrosshair();
    fireEvent.click(
      within(s.getByTestId('confirm-smoke')).getByRole('button', { name: 'The same smoke' }),
    );
    expect(s.entries()).toBe(3);
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatch(/^added:/);
  });

  // Requirement change (Req 4.3 as amended 2026-11-22): the age of the open smoke no longer changes
  // the view; choosing "a different smoke" still starts one.
  it('with an old smoke open: neither answer is preselected, and "a different smoke" starts one', async () => {
    const maxAgeMs = createFakeEnvironment().environment.parameters.maxIncidentAgeMs;
    const old = postsIncident(['west', 'east'], (_p, i) => ({
      bearing: { timeUtcMs: 1_790_000_000_000 - maxAgeMs - 60_000 * (i + 1) },
    }));
    const s = mount({ stored: storedWith([old]) });
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    for (const name of ['A different smoke', 'The same smoke']) {
      expect(within(dialog).getByRole('button', { name }).dataset.preselected).toBeUndefined();
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'A different smoke' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(2);
    expect(s.entries()).toBe(1);
  });

  it('shows a refused answer in the view, and stays on it', async () => {
    const s = mount({
      stored: storedWith([postsIncident(['west', 'east'])]),
      extra: { randomAvailable: false },
    });
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    fireEvent.click(within(dialog).getByRole('button', { name: 'The same smoke' }));
    const m = messageFor({ ok: false, reason: 'random_unavailable' });
    expect(within(dialog).getByRole('alert').textContent).toBe(`${m.whatHappened} ${m.whatToDo}`);
    expect(s.entries()).toBe(2);
    expect(s.calls).toEqual([]);
  });

  it('Back leaves without saving the unanswered capture, as before', async () => {
    const s = mount({ stored: storedWith([postsIncident(['west', 'east'])]) });
    await s.captureOnCrosshair();
    fireEvent.click(s.getByRole('button', { name: 'Back' }));
    expect(s.calls).toEqual(['back']);
    expect(s.entries()).toBe(2);
  });
});

describe('SightScreen in Simulation mode (Req 3.3)', () => {
  it('renders the shell\u2019s sighting source and says the field of view and tap sigma are simulation values', () => {
    const listeners: ((session: Session) => void)[] = [];
    const s = renderScreen(<SightScreen onBack={() => undefined} onAdded={() => undefined} />, {
      mode: 'simulation',
      sighting: recordingSightingSource(listeners, <p data-testid="simulator-marker">simulator</p>),
    });
    expect(s.getByTestId('simulator-marker')).toBeTruthy();
    expect(s.getByTestId('sight-screen').textContent).toContain(SIMULATION_VALUES_TEXT);
    expect(listeners).toHaveLength(1);
  });
});
