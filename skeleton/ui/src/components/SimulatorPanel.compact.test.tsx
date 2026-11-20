// The compact presentation of the Simulator panel (task group 30, design D34; Req 17.4, 17.7):
// what a reviewer needs is in view in the order of use (the scene, the Station, the sighting
// screen with Start), the Simulator's own controls (seed, speed, play, pause, step, restart) are
// inside a closed disclosure, and Start also starts the script playing. An application that shows
// its own Station chooser passes `selectedStationId`: the panel follows it and shows none.

import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildCatalogue, type CatalogueScene } from '../math/scene/catalogue';
import type { Session } from '../math/session/session';
import { fakeObserver } from '../test-support/fake-observe';
import { FakeTimer } from '../test-support/fake-timer';
import { PARAMETERS } from '../test-support/session-fixtures';
import { SimulatorPanel, type SimulatorContext, type SimulatorPanelProps } from './SimulatorPanel';

const built = buildCatalogue();
if (!built.ok) throw new Error(built.reason);
const CATALOGUE: readonly CatalogueScene[] = built.value;
const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

function mount(extra: Partial<SimulatorPanelProps> = {}) {
  const timer = new FakeTimer();
  const observer = fakeObserver({ widthPx: 390, heightPx: 844 });
  const seen: { session: Session; context: SimulatorContext }[] = [];
  const props = (more: Partial<SimulatorPanelProps>): SimulatorPanelProps => ({
    catalogue: CATALOGUE,
    timer,
    parameters: PARAMETERS,
    sensorOptions: OPTIONS,
    tapSigmaPx: 1,
    initialSceneId: 'steady',
    observe: observer.observe,
    onSession: (session, context) => void seen.push({ session, context }),
    ...more,
  });
  const utils = render(<SimulatorPanel {...props(extra)} />);
  const q = within(utils.container);
  const settle = async (fn: () => void) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
  };
  const start = () =>
    settle(() =>
      fireEvent.click(utils.container.querySelector('[data-control="start"]') as HTMLElement),
    );
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i += 1) await settle(() => timer.advance(100));
  };
  const state = () => q.getByTestId('sighting-screen').dataset.state;
  const last = () => seen[seen.length - 1];
  const rerender = (more: Partial<SimulatorPanelProps>) =>
    settle(() => utils.rerender(<SimulatorPanel {...props({ ...extra, ...more })} />));
  return { ...utils, ...q, timer, seen, settle, start, ticks, state, last, rerender };
}

/** Whether `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('SimulatorPanel, compact presentation (task group 30)', () => {
  it('puts the scene, the Station and Start first, and the Simulator controls in a closed disclosure after them', () => {
    const m = mount({ presentation: 'compact' });
    const scene = m.getByLabelText('Scene');
    const station = m.getByLabelText('Station');
    const start = m.container.querySelector('[data-control="start"]');
    if (start === null) throw new Error('no Start');
    const disclosure = m.getByTestId('simulator-controls');
    expect(disclosure.tagName).toBe('DETAILS');
    expect((disclosure as HTMLDetailsElement).open).toBe(false);
    expect(disclosure.querySelector('summary')?.textContent).toBe('Simulator controls');
    // Neither chooser of what to sight is folded away.
    expect(disclosure.contains(scene)).toBe(false);
    expect(disclosure.contains(station)).toBe(false);
    for (const label of ['Seed', 'Speed']) {
      expect(disclosure.contains(m.getByLabelText(label))).toBe(true);
    }
    for (const label of ['Play', 'Pause', 'Step', 'Restart']) {
      expect(disclosure.contains(m.getByText(label))).toBe(true);
    }
    expect(before(scene, station)).toBe(true);
    expect(before(station, start)).toBe(true);
    expect(before(start, disclosure)).toBe(true);
    // The description and the truth (Req 17.7) are still shown, after the sighting screen.
    expect(before(start, m.getByTestId('scene-description'))).toBe(true);
    expect(before(start, m.getByTestId('truth'))).toBe(true);
  });

  it('starts the script playing with Start: the Session reaches live with no Play', async () => {
    const m = mount({ presentation: 'compact' });
    await m.start();
    expect((m.getByText('Play') as HTMLButtonElement).disabled).toBe(true);
    await m.ticks(20);
    expect(m.state()).toBe('live');
    expect(m.last()?.session.history.samples.length).toBeGreaterThan(10);
  });

  it('keeps the full presentation as it was: Start does not play, and the controls are not folded', async () => {
    const m = mount();
    expect(m.queryByTestId('simulator-controls')).toBeNull();
    await m.start();
    await m.ticks(5);
    expect(m.last()?.session.history.samples.length).toBe(0);
  });

  it('pauses from inside the disclosure, and Start of a new Session plays again', async () => {
    const m = mount({ presentation: 'compact' });
    await m.start();
    await m.ticks(20);
    await m.settle(() => fireEvent.click(m.getByText('Pause')));
    const samples = m.last()?.session.history.samples.length ?? 0;
    await m.ticks(5);
    expect(m.last()?.session.history.samples.length).toBe(samples);
    fireEvent.change(m.getByLabelText('Station'), { target: { value: 'east' } });
    await m.settle(() => undefined);
    expect(m.state()).toBe('permission');
    await m.start();
    await m.ticks(20);
    expect(m.state()).toBe('live');
    expect(m.last()?.context.station.id).toBe('east');
  });
});

describe('SimulatorPanel with the Station chosen by the application (task group 30)', () => {
  it('shows no Station chooser of its own and follows the Station it is given', async () => {
    const m = mount({ presentation: 'compact', selectedStationId: 'west' });
    expect(m.queryByLabelText('Station')).toBeNull();
    expect(m.last()?.context.station.id).toBe('west');
    await m.rerender({ selectedStationId: 'east' });
    expect(m.last()?.context.station.id).toBe('east');
    expect(m.state()).toBe('permission');
    // The truth is the new Station's (Req 17.7).
    const east = m.last()?.context.station.name ?? '';
    expect(east).toBe('East post');
  });

  it('keeps the given Station across a change of scene when the new scene has it', async () => {
    const m = mount({ presentation: 'compact', selectedStationId: 'east' });
    expect(m.last()?.context.station.id).toBe('east');
    fireEvent.change(m.getByLabelText('Scene'), { target: { value: 'iphone' } });
    await m.settle(() => undefined);
    const now = m.last()?.context;
    expect(now?.scene.id).toBe('iphone');
    expect(now?.station.id).toBe('east');
    // No Session of the new scene was ever on its first Station.
    expect(
      m.seen.some((s) => s.context.scene.id === 'iphone' && s.context.station.id === 'west'),
    ).toBe(false);
  });

  it('ignores a Station id that the scene does not have, and stays where it was', async () => {
    const m = mount({ presentation: 'compact', selectedStationId: 'west' });
    await m.rerender({ selectedStationId: 'nowhere' });
    expect(m.getByTestId('simulator-panel')).toBeTruthy();
    expect(m.last()?.context.station.id).toBe('west');
  });
});

describe('SimulatorPanel with the scene chosen by the application (task group 33)', () => {
  it('shows no scene chooser of its own when `hideSceneChooser` is given, in either presentation, and keeps every other control', () => {
    for (const presentation of ['compact', 'full'] as const) {
      const m = mount({ presentation, hideSceneChooser: true, selectedStationId: 'west' });
      expect(m.queryByLabelText('Scene')).toBeNull();
      if (presentation === 'compact') {
        // No empty row is left where the choosers were: no select outside the closed disclosure.
        const outside = [...m.getByTestId('simulator-panel').querySelectorAll('select')].filter(
          (el) => el.closest('[data-testid="simulator-controls"]') === null,
        );
        expect(outside).toHaveLength(0);
      }
      expect(m.container.querySelector('[data-control="start"]')).not.toBeNull();
      expect(m.getByTestId('sighting-screen')).toBeTruthy();
      m.unmount();
    }
  });

  it('shows it as before when the property is absent or false', () => {
    for (const hideSceneChooser of [undefined, false]) {
      const m = mount({
        presentation: 'compact',
        ...(hideSceneChooser === undefined ? {} : { hideSceneChooser }),
      });
      expect(m.getByLabelText('Scene')).toBeTruthy();
      m.unmount();
    }
  });

  it('still shows the scene the application chose: the panel stays on the scene it is given', async () => {
    const m = mount({ presentation: 'compact', hideSceneChooser: true, initialSceneId: 'iphone' });
    await m.start();
    expect(m.last()?.context.scene.id).toBe('iphone');
  });
});
