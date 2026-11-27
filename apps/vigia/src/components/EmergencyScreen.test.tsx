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
  const textBlock = (): HTMLElement => s.getByLabelText('Text for the emergency call');
  const shown = (): string => textBlock().textContent ?? '';
  return { ...s, textBlock, shown };
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
    // Mira: the tab's title, then the danger card.
    expect(screen.firstElementChild?.textContent).toBe('Emergency');
    expect(screen.children[1]?.textContent).toBe(EMERGENCY_NOT_CALLING_TEXT);
    expect(s.shown()).toBe(expected(s, false, START_UTC_MS));
    expect(Number.parseFloat(s.textBlock().style.fontSize)).toBeGreaterThanOrEqual(SIZES.labelPx);
    expect(s.shown()).toContain('Written at 14:13 UTC.');
  });

  it('keeps the own position out of the text until the switch is turned on', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const toggle = s.getByRole('switch', { name: 'Include where I took my last sighting' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(s.shown()).not.toContain('I last sighted from');
    fireEvent.click(toggle);
    expect(s.shown()).toBe(expected(s, true, START_UTC_MS));
    expect(s.shown()).toContain('I last sighted from ');
  });

  it('Copy copies exactly the text shown', async () => {
    const s = show([postsIncident(['west', 'east'])]);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy the text' })));
    expect(s.fake.navigator.written).toEqual([s.shown()]);
    expect(s.getByRole('status').textContent).toBe('Copied. Paste it or read it out.');
  });

  it('a failed copy says clipboard_unavailable beside Copy and leaves the whole text selected', async () => {
    const s = show([postsIncident(['west', 'east'])], { navigator: { clipboard: 'reject' } });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy the text' })));
    const block = s.textBlock();
    expect(within(s.getByTestId('copy-box')).getByRole('alert').textContent).toBe(
      messageText('clipboard_unavailable'),
    );
    const selection = document.getSelection();
    expect(selection?.rangeCount).toBe(1);
    expect(selection?.getRangeAt(0).toString()).toBe(s.shown());
    expect(block.contains(selection?.anchorNode ?? null)).toBe(true);
    expect(s.queryByRole('status')).toBeNull();
  });

  it('is produced again when the Fix changes, with its new time, and nothing of the earlier one is left', async () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const before = s.shown();
    await s.settle(() => s.fake.timer.advance(120_000));
    expect(s.shown()).toBe(before);
    const id = s.store.getSnapshot().open?.incident.entries[0]?.sighting.sightingId ?? '';
    await s.settle(() => void s.store.dispatch({ kind: 'hide', sightingId: id }));
    const after = s.shown();
    expect(after).not.toBe(before);
    expect(after).toBe(expected(s, false, START_UTC_MS + 120_000));
    expect(after).toContain('Written at 14:15 UTC.');
    expect(after).toContain('(1 set aside)');
  });

  it('with one sighting: the direction-only text', () => {
    const s = show([postsIncident(['west'])]);
    expect(s.shown()).toContain('Direction only, not a place');
  });

  it('with no sighting: how to start, and nothing to copy', () => {
    const s = show([]);
    expect(s.getByTestId('emergency-screen').textContent).toContain(checkStatement('none'));
    expect(s.queryByLabelText('Text for the emergency call')).toBeNull();
    expect(s.queryByRole('button', { name: /Copy/ })).toBeNull();
  });
});

// Task 21.2: on a phone the text was in a box of fixed height that scrolled inside it, and only
// its first half was seen; the switch's state stood one letter a line.
describe('EmergencyScreen, the text shown whole (task 21.2)', () => {
  it('is in the page\u2019s flow: no box of its own height, no scroll inside, the lines kept', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const block = s.textBlock();
    expect(block.tagName).not.toBe('TEXTAREA');
    expect(block.querySelector('textarea, input')).toBeNull();
    for (const element of [block, ...block.querySelectorAll<HTMLElement>('*')]) {
      expect(element.style.height).toBe('');
      expect(element.style.maxHeight).toBe('');
      expect(['', 'visible']).toContain(element.style.overflowY);
      expect(['', 'visible']).toContain(element.style.overflow);
    }
    expect(block.style.whiteSpace).toBe('pre-wrap');
    expect(block.style.userSelect).toBe('text');
    // Every line of the text is in the block, in order.
    expect(s.shown().split('\n')).toEqual(expected(s, false, START_UTC_MS).split('\n'));
  });

  it("gives the switch's state room of its own: it neither shrinks nor wraps", () => {
    const s = show([postsIncident(['west', 'east'])]);
    const toggle = s.getByRole('switch', { name: 'Include where I took my last sighting' });
    const state = toggle.querySelector<HTMLElement>('[data-part="switch-state"]');
    const label = toggle.querySelector<HTMLElement>('[data-part="switch-label"]');
    if (state === null || label === null) throw new Error('no parts');
    expect(state.textContent).toBe('Off');
    expect(state.style.whiteSpace).toBe('nowrap');
    expect(state.style.flexShrink).toBe('0');
    expect(state.style.overflowWrap).not.toBe('anywhere');
    // The label takes the room left and wraps between words.
    expect(label.style.flexGrow).toBe('1');
    expect(label.style.minWidth).toBe('0px');
    expect(toggle.style.overflowWrap).not.toBe('anywhere');
    fireEvent.click(toggle);
    expect(state.textContent).toBe('On');
  });
});

describe('EmergencyScreen in Simulation mode (Req 14.7)', () => {
  it('begins with the SIMULATION line, and the Copy control says so', async () => {
    const s = renderScreen(<EmergencyScreen />, { mode: 'simulation' });
    const bearing = pointingAt('bearing-1', postPosition('west'), TARGET, 0, {
      timeUtcMs: START_UTC_MS - 1000,
    });
    await s.settle(() => void s.store.capture(bearing, 'new'));
    const block = s.getByLabelText('Text for the emergency call');
    expect((block.textContent ?? '').split('\n')[0]).toBe(
      'SIMULATION: synthetic scene, not a real place.',
    );
    expect(s.getByRole('button', { name: 'Copy the simulation text' })).toBeTruthy();
  });
});
