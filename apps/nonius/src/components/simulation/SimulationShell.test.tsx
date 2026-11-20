// The simulation shell (Req 13.1, 13.3, 11.5, 15.7; design §10, D20): the banner and the phone bar
// on every screen, the Sight time and its control, the note on the still Sun, the reviewer's path,
// and the Comparison and the Index error from the scene's truth with no Sensor source asked.

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountSimulation } from '../../test-support/simulation-driver';

describe('SimulationShell', () => {
  it('shows the banner and, under it, the bar of what the reviewer holds, on every screen', async () => {
    const m = mountSimulation();
    const shell = m.q.getByTestId('app-shell');
    const heads = () =>
      [...shell.children].slice(0, 2).map((c) => (c as HTMLElement).dataset.testid);
    for (const go of [
      async () => m.tab('Sights'),
      async () => m.tab('Map'),
      async () => m.tab('Fix'),
      async () => m.click('How it works').then(() => m.click('Back')),
      async () => m.click('Measure the index error'),
      async () => m.click('Cancel'),
      async () => m.click('Sight the Sun'),
    ]) {
      await go();
      expect(heads()).toEqual(['simulation-banner', 'phone-bar']);
    }
  });

  it('says the Sight time in the bar as its chooser reads, and in full, with its date and the still-Sun note, on the Sight screen', async () => {
    const m = mountSimulation();
    expect(m.sightTimeShown()).toBe('1/3 11:40');
    await m.click('Sight the Sun');
    expect(m.text('sight-time-note')).toContain(
      'Sight time 1 of 3: 11:40 UTC, 21 Dec 2026 (simulated)',
    );
    expect(m.text('sight-time-note')).toContain(
      'The simulated Sun stands still: a sight taken a minute late is up to 15′ off.',
    );
  });

  it('changes the Sight time with Next sight time, and with its select, and the Station of the panel follows', async () => {
    const m = mountSimulation();
    await m.nextSightTime();
    expect(m.sightTimeShown()).toBe('2/3 14:40');
    await m.choose('Sight time', '2');
    expect(m.sightTimeShown()).toBe('3/3 17:40');
    await m.nextSightTime();
    expect(m.sightTimeShown()).toBe('1/3 11:40');
    await m.nextSightTime();
    await m.click('Sight the Sun');
    await m.press('start');
    await m.ticks(5);
    const last = m.sessions[m.sessions.length - 1];
    expect(last?.context.station.id).toBe('sight-2');
    expect(last?.context.scene.id).toBe('good-day-2');
  });

  it('changes the scene with its select: the Sight times of that scene, and no sights of the other', async () => {
    const m = mountSimulation();
    await m.choose('Scene', 'too-close');
    expect(m.sightTimeShown()).toBe('1/2 13:00');
    await m.nextSightTime();
    expect(m.sightTimeShown()).toBe('2/2 13:40');
  });

  it('gives the reviewer the path in three short numbered lines on the first screen, until a sight is taken', async () => {
    const m = mountSimulation();
    const path = m.q.getByTestId('reviewer-path');
    expect(within(path).getAllByRole('listitem')).toHaveLength(3);
    expect(path.querySelector('ol')).not.toBeNull();
    await m.sight();
    expect(m.q.queryByTestId('reviewer-path')).toBeNull();
  });

  it('takes the Comparison from the scene’s truth, labelled, with no location asked of a sensor', async () => {
    const m = mountSimulation();
    for (let i = 0; i < 3; i += 1) {
      await m.sight();
      if (i < 2) await m.nextSightTime();
    }
    await m.click(/Compare with this phone/);
    const text = m.text('comparison');
    expect(text).toMatch(/scene.s true position \(simulated\)/);
    expect(m.container.textContent).not.toContain(String(CATALOGUE_ORIGIN.latRad));
  });

  it('offers the Index error from the scene’s truth, labelled, with the simulation accuracy of 5 m', async () => {
    const m = mountSimulation();
    await m.click('Measure the index error');
    await m.click("Use this phone's location");
    expect(m.container.textContent).toContain('accurate to about 5 m');
    expect(m.container.textContent).toMatch(/scene.s true position, simulated/);
  });

  it('offers the Simulation mode control only when the browser has the orientation event', () => {
    expect(
      mountSimulation({ hasDeviceOrientation: false }).q.queryByTestId('mode-control'),
    ).toBeNull();
    const m = mountSimulation({ hasDeviceOrientation: true });
    fireEvent.click(m.q.getByRole('button', { name: 'This phone' }));
    expect(m.q.getByTestId('mode-control')).toBeTruthy();
  });
});
