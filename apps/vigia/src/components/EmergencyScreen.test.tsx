// The Emergency screen (design §9, §7.12; Req 14.2 to 14.7): the not-calling statement, the text
// at readout size and selectable, with the time it was made, produced again when the Fix changes;
// Copy, and on a failed copy the text left selected with `clipboard_unavailable`; the own-position
// switch off by default; the `SIMULATION:` line and a Copy control that says so.

import { SIZES } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { checkStatement } from '../math/assessment/statements';
import { emergencyText } from '../math/fix/emergency-text';
import { messageFor } from '../math/messages';
import type { Incident } from '../math/incident/incident-state';
import { EMERGENCY_NOT_CALLING_TEXT } from '../math/texts';
import type { FakeEnvironmentOptions } from '../test-support/fake-environment';
import { START_UTC_MS } from '../test-support/fake-environment';
import { pointingAt, postPosition, postsIncident, TARGET } from '../test-support/geometry-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { EmergencyScreen } from './EmergencyScreen';

function show(incidents: readonly Incident[], options: FakeEnvironmentOptions = {}) {
  const s = renderScreen(<EmergencyScreen />, { storedItems: storedWith(incidents), ...options });
  const textArea = (): HTMLTextAreaElement =>
    s.getByLabelText('Text for the emergency call') as HTMLTextAreaElement;
  return { ...s, textArea };
}

function expected(
  s: ReturnType<typeof show>,
  includeOwnPosition: boolean,
  nowUtcMs: number,
): string {
  const snap = s.store.getSnapshot();
  if (snap.open === null || !snap.open.assessment.ok) throw new Error('no assessment');
  const text = emergencyText(
    {
      assessment: snap.open.assessment.value,
      nowUtcMs,
      mode: 'device',
      ownPosition: snap.ownPosition,
      includeOwnPosition,
    },
    s.fake.environment.parameters,
  );
  if (!text.ok) throw new Error(text.reason);
  return text.value;
}

const messageText = (reason: 'clipboard_unavailable') => {
  const m = messageFor({ ok: false, reason });
  return `${m.whatHappened} ${m.whatToDo}`;
};

describe('EmergencyScreen (Req 14.3 to 14.6)', () => {
  it('says first that the app calls no one, then gives the text of §7.12 at readout size', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const screen = s.getByTestId('emergency-screen');
    expect(screen.firstElementChild?.textContent).toBe(EMERGENCY_NOT_CALLING_TEXT);
    expect(s.textArea().value).toBe(expected(s, false, START_UTC_MS));
    expect(s.textArea().readOnly).toBe(true);
    expect(Number.parseFloat(s.textArea().style.fontSize)).toBeGreaterThanOrEqual(SIZES.labelPx);
    expect(s.textArea().value).toContain('Written at 14:13 UTC.');
  });

  it('keeps the own position out of the text until the switch is turned on', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const toggle = s.getByRole('switch', { name: 'Include where I took my last sighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(s.textArea().value).not.toContain('I last sighted from');
    fireEvent.click(toggle);
    expect(s.textArea().value).toBe(expected(s, true, START_UTC_MS));
    expect(s.textArea().value).toContain('I last sighted from ');
  });

  it('Copy copies exactly the text shown', async () => {
    const s = show([postsIncident(['west', 'east'])]);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy the text' })));
    expect(s.fake.navigator.written).toEqual([s.textArea().value]);
    expect(s.getByRole('status').textContent).toBe('Copied. Paste it or read it out.');
  });

  it('a failed copy says clipboard_unavailable beside Copy and leaves the whole text selected', async () => {
    const s = show([postsIncident(['west', 'east'])], { navigator: { clipboard: 'reject' } });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy the text' })));
    const area = s.textArea();
    expect(within(s.getByTestId('copy-box')).getByRole('alert').textContent).toBe(
      messageText('clipboard_unavailable'),
    );
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(0);
    expect(area.selectionEnd).toBe(area.value.length);
    expect(s.queryByRole('status')).toBeNull();
  });

  it('is produced again when the Fix changes, with its new time, and nothing of the earlier one is left', async () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const before = s.textArea().value;
    await s.settle(() => s.fake.timer.advance(120_000));
    expect(s.textArea().value).toBe(before);
    const id = s.store.getSnapshot().open?.incident.entries[0]?.sighting.sightingId ?? '';
    await s.settle(() => void s.store.dispatch({ kind: 'hide', sightingId: id }));
    const after = s.textArea().value;
    expect(after).not.toBe(before);
    expect(after).toBe(expected(s, false, START_UTC_MS + 120_000));
    expect(after).toContain('Written at 14:15 UTC.');
    expect(after).toContain('(1 set aside)');
  });

  it('with one sighting: the direction-only text', () => {
    const s = show([postsIncident(['west'])]);
    expect(s.textArea().value).toContain('Direction only, not a place');
  });

  it('with no sighting: how to start, and nothing to copy', () => {
    const s = show([]);
    expect(s.getByTestId('emergency-screen').textContent).toContain(checkStatement('none'));
    expect(s.queryByLabelText('Text for the emergency call')).toBeNull();
    expect(s.queryByRole('button', { name: /Copy/ })).toBeNull();
  });
});

describe('EmergencyScreen in Simulation mode (Req 14.7)', () => {
  it('begins with the SIMULATION line, and the Copy control says so', async () => {
    const s = renderScreen(<EmergencyScreen />, { mode: 'simulation' });
    const bearing = pointingAt('bearing-1', postPosition('west'), TARGET, 0, {
      timeUtcMs: START_UTC_MS - 1000,
    });
    await s.settle(() => void s.store.capture(bearing, 'new'));
    const area = s.getByLabelText('Text for the emergency call') as HTMLTextAreaElement;
    expect(area.value.split('\n')[0]).toBe('SIMULATION: synthetic scene, not a real place.');
    expect(s.getByRole('button', { name: 'Copy the simulation text' })).toBeTruthy();
  });
});
