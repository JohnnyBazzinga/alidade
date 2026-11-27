// The Simulation shell (design D16, §10; Req 17.1, 17.4, 17.5): one phone for each Station of the
// chosen scene; the Station the panel is on is the phone in hand; the others keep their
// sightings; the Clock is the largest time any Session has reported; the Incident ids begin with
// Z; a code goes to another phone as text only; the banner is on every screen.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME_TITLE, SIMULATION_TEXT } from '../../math/texts';
import { mountSimulation } from '../../test-support/simulation-driver';

describe('the shell at the start', () => {
  it('shows the Smoke screen of the first Station of the first scene, with the four tabs', async () => {
    const m = mountSimulation();
    await m.settle();
    expect(m.getByTestId('smoke-screen')).toBeTruthy();
    expect(within(m.getByTestId('tab-bar')).getAllByRole('tab')).toHaveLength(4);
    expect(m.getByText(HOME_TITLE)).toBeTruthy();
  });

  it('offers the four scenes in the panel, in order, and the Stations of the first', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.openSight();
    const scenes = [...(m.getByLabelText('Scene') as HTMLSelectElement).options].map(
      (o) => o.value,
    );
    expect(scenes).toEqual(['two-posts', 'three-posts', 'four-posts-one-wrong', 'almost-in-line']);
    const stations = [
      ...(m.getByLabelText('You hold the phone at') as HTMLSelectElement).options,
    ].map((o) => o.value);
    expect(stations).toEqual(['west', 'east']);
    // One chooser of the post on the screen: the panel shows none of its own (task 21.4).
    expect(m.queryByLabelText('Station')).toBeNull();
  });

  it('shows the banner on every screen, the Sight screen included', async () => {
    const m = mountSimulation();
    await m.settle();
    const banner = () => m.getAllByText(SIMULATION_TEXT);
    expect(banner()).toHaveLength(1);
    for (const tab of ['Sightings', 'Map', 'Emergency', 'Smoke']) {
      await m.tab(tab);
      expect(banner()).toHaveLength(1);
    }
    await m.openSight();
    expect(banner()).toHaveLength(1);
  });

  it('has no mode control without DeviceOrientationEvent, and has it with', async () => {
    const without = mountSimulation({ hasDeviceOrientation: false });
    await without.settle();
    expect(without.queryByTestId('mode-control')).toBeNull();
    without.unmount();
    const withIt = mountSimulation({ hasDeviceOrientation: true });
    await withIt.settle();
    // Mira: the mode control is in the panel that the "Data and mode" tile opens.
    fireEvent.click(withIt.getByTestId('data-tile'));
    const control = withIt.getByTestId('mode-control');
    expect(
      within(control).getByRole('button', { name: 'Simulator' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await withIt.settle(() =>
      fireEvent.click(within(control).getByRole('button', { name: 'This phone' })),
    );
    expect(withIt.modes).toEqual(['device']);
  });
});

describe('the phone in hand', () => {
  it('is the Station the panel is on: changing it changes the screens, and the others keep their sightings', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.sight('west', 'crosshair', 'new');
    expect(m.getByText(/1 sighting, 1 used/)).toBeTruthy();

    await m.switchTo('east');
    expect(m.getByText(HOME_TITLE)).toBeTruthy();
    await m.tab('Sightings');
    expect(m.queryAllByTestId('sighting-row')).toHaveLength(0);
    await m.tab('Smoke');

    await m.switchTo('west');
    expect(m.getByText(/1 sighting, 1 used/)).toBeTruthy();
    await m.tab('Sightings');
    expect(m.getAllByTestId('sighting-row')).toHaveLength(1);
  });

  it('keeps the panel’s scene and Station when the reviewer leaves the Sight screen and comes back', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.openSight();
    await m.chooseScene('three-posts');
    await m.chooseStation('side');
    await m.click('Back');
    await m.openSight();
    expect((m.getByLabelText('Scene') as HTMLSelectElement).value).toBe('three-posts');
    expect((m.getByLabelText('You hold the phone at') as HTMLSelectElement).value).toBe('side');
  });

  it('changes the post from any screen, and the panel goes to it: the next capture is from there', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.tab('Map');
    await m.chooseStation('east');
    await m.tab('Smoke');
    await m.openSight();
    expect(m.sessions.at(-1)?.context.station.id).toBe('east');
    await m.toLive();
    await m.press('freeze');
    await m.press('capture');
    expect(m.sightingState()).toBe('captured');
    expect(m.sessions.at(-1)?.context.station.id).toBe('east');
    await m.chooseStation('west');
    expect(m.sessions.at(-1)?.context.station.id).toBe('west');
    expect(m.sightingState()).toBe('permission');
  });

  it('does not ask the question again for a capture it already gave', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.sight('west', 'crosshair', 'new');
    await m.openSight();
    expect(m.sightingState()).toBe('captured');
    expect(m.queryByTestId('confirm-smoke')).toBeNull();
  });

  it('makes a new scene new phones: the sightings of the old scene are gone', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.sight('west', 'crosshair', 'new');
    await m.openSight();
    await m.chooseScene('three-posts');
    await m.click('Back');
    expect(m.getByText(HOME_TITLE)).toBeTruthy();
  });
});

// Task 21.4 (skeleton-ui task group 30): the reviewer meets what to sight and Start first; the
// Simulator's own controls are folded away; Start also plays the script.
describe('the Sight screen of a reviewer', () => {
  const before = (a: Element, b: Element) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('puts the post, the scene and Start before the folded Simulator controls', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.openSight();
    const post = m.getByLabelText('You hold the phone at');
    const scene = m.getByLabelText('Scene');
    const start = m.control('start');
    const folded = m.getByTestId('simulator-controls') as HTMLDetailsElement;
    expect(folded.open).toBe(false);
    expect(folded.querySelector('summary')?.textContent).toBe('Simulator controls');
    expect(folded.contains(m.getByText('Play'))).toBe(true);
    expect(folded.contains(m.getByLabelText('Seed'))).toBe(true);
    expect(before(post, scene)).toBe(true);
    expect(before(scene, start)).toBe(true);
    expect(before(start, folded)).toBe(true);
    // The guidance on aiming at smoke is still on the screen, after the sighting (task 21.4).
    expect(before(start, m.getByTestId('guidance'))).toBe(true);
  });

  it('plays the script from Start: live with no Play', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.openSight();
    await m.press('start');
    await m.ticks(20);
    expect(m.sightingState()).toBe('live');
  });
});

describe('the Incident ids and the Clock', () => {
  it('makes the smoke’s id begin with Z: the Inbox of another phone says it comes from a simulation', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.sight('west', 'crosshair', 'new');
    await m.shareOwnSightingTo('the phone at the east post');
    await m.switchTo('east');
    await m.click(/Add a sighting someone sent me/);
    expect(m.getByTestId('inbox-card').textContent).toContain('simulation');
  });

  it('counts ages in simulated time: the smoke began at the script’s start, not at the real clock', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.sight('west', 'crosshair', 'new');
    // The scripts start at 2026-09-21 14:13:20 UTC, 1 790 000 000 000 ms.
    expect(m.getByText(/Smoke started 14:13 UTC, /)).toBeTruthy();
  });
});

describe('sending a code to another phone', () => {
  it('delivers it as text to that phone’s Inbox alone, with no link, no QR and no system share', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.sight('west', 'crosshair', 'new');
    await m.tab('Sightings');
    const row = m.getAllByTestId('sighting-row')[0];
    if (row === undefined) throw new Error('row');
    await m.settle(() => fireEvent.click(within(row).getByRole('button', { name: 'Share' })));
    const sheet = m.getByTestId('share-sheet');
    expect(within(sheet).queryByRole('button', { name: /Copy link/ })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /Show QR/ })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /Share…/ })).toBeNull();
    const peers = within(sheet)
      .getAllByRole('button', { name: /^Send to / })
      .map((b) => b.textContent);
    expect(peers.length).toBeGreaterThan(0);
    expect(m.gate.calls).toEqual([]);
  });

  it('puts a code in the Inbox of the phone it was sent to and in no other', async () => {
    const m = mountSimulation();
    await m.settle();
    await m.openSight();
    await m.chooseScene('three-posts');
    await m.click('Back');
    await m.sight('west', 'crosshair', 'new');
    await m.shareOwnSightingTo('the phone at the east post');
    await m.switchTo('side');
    await m.tab('Smoke');
    expect(m.queryByText(/\(1 waiting\)/)).toBeNull();
    await m.switchTo('east');
    expect(m.getByText(/\(1 waiting\)/)).toBeTruthy();
  });
});
