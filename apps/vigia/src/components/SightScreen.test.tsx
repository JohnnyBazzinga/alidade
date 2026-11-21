// The Sight screen (design §9; Req 3.1 to 3.8, 4.2, 4.3, 16.2): UI's sighting screen through UI's
// `DeviceSighting` on a phone (crosshair only: no calibration, no tap sigma), the guidance before
// and after the first capture, and the question after a capture, preselected only within the
// maximum Incident age; nothing is added until it is answered.

import {
  createSimulator,
  type SensorSource,
  type SimulatorControls,
  type SimulatorScript,
} from '@alidade/sensors';
import { buildCatalogue, defaultSessionParameters, type Session } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { SIMULATION_VALUES_TEXT, sightingGuidance, TWO_SMOKES_TEXT } from '../math/texts';
import { FakeCameraSurface, fixedSize } from '../test-support/fake-camera';
import {
  createFakeEnvironment,
  recordingSightingSource,
  type FakeEnvironmentOptions,
} from '../test-support/fake-environment';
import { postsIncident } from '../test-support/geometry-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import type { SightingSource } from './environment';
import { SightScreen } from './SightScreen';

const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};
const SESSION_PARAMETERS = defaultSessionParameters();

const catalogue = buildCatalogue();
if (!catalogue.ok) throw new Error(catalogue.reason);
const steady = catalogue.value.find((c) => c.scene.id === 'steady');
const firstStation = steady?.scene.stations[0];
const found = firstStation === undefined ? undefined : steady?.scripts[firstStation.id];
if (found === undefined) throw new Error('the steady scene has no script');
const SCRIPT: SimulatorScript = found;

function mount(stored: Record<string, string> = {}, extra: FakeEnvironmentOptions = {}) {
  const sensors = { controls: null as SimulatorControls | null };
  const camera = new FakeCameraSurface();
  const sighting: SightingSource = {
    kind: 'device',
    createSource: () => {
      const sim = createSimulator(SCRIPT, 1, SIMULATOR_OPTIONS);
      if (!sim.ok) return sim;
      sensors.controls = sim.value.controls;
      const source: SensorSource = sim.value.source;
      return { ok: true, value: source };
    },
    cameraSurface: camera,
    sessionParameters: SESSION_PARAMETERS,
    observe: fixedSize(360, 640),
  };
  const fake = createFakeEnvironment({ ...extra, sighting, storedItems: stored });
  const calls: string[] = [];
  const screen = renderScreen(
    <SightScreen onBack={() => void calls.push('back')} onAdded={() => void calls.push('added')} />,
    {},
    fake,
  );
  const press = (id: string) =>
    screen.settle(() => {
      const el = screen.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
      if (el === null) throw new Error(`no control ${id}`);
      fireEvent.click(el);
    });
  const advance = async (ms: number) => {
    for (let t = 50; t <= ms; t += 50) {
      await screen.settle(() => {
        sensors.controls?.advanceTo(SCRIPT.startUtcMs + t);
        fake.timer.advance(50);
      });
    }
  };
  const captureOnCrosshair = async () => {
    await screen.settle();
    await press('start');
    await advance(1500);
    await press('freeze');
    await press('capture');
  };
  const entries = () => screen.store.getSnapshot().open?.incident.entries.length ?? 0;
  return { ...screen, camera, calls, press, advance, captureOnCrosshair, entries };
}

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

describe('the guidance (Req 3.7, 16.2)', () => {
  it('is in view before the first capture and one tap away after it', async () => {
    const s = mount();
    await s.settle();
    const before = s.getByTestId('guidance');
    expect(before.querySelector('details')).toBeNull();
    for (const sentence of sightingGuidance(false)) expect(before.textContent).toContain(sentence);
    await s.captureOnCrosshair();
    const after = s.getByTestId('guidance');
    expect(after.querySelector('details')?.open).toBe(false);
    for (const sentence of sightingGuidance(false)) expect(after.textContent).toContain(sentence);
  });
});

describe('the question after a capture (Req 4.2, 4.3)', () => {
  it('with no smoke open: one answer, which starts a smoke, and nothing before it is given', async () => {
    const s = mount();
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    expect(dialog.textContent).toContain('This sighting starts a new smoke on this phone.');
    expect(s.store.getSnapshot().state.incidents).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Start a new smoke with this sighting' }),
    );
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.entries()).toBe(1);
    expect(s.calls).toEqual(['added']);
  });

  it('with a recent smoke open: "the same smoke" is preselected, and nothing is added until a tap', async () => {
    const s = mount(storedWith([postsIncident(['west', 'east'])]));
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    expect(dialog.textContent).toContain('Is this the same smoke as before?');
    expect(dialog.textContent).toContain(TWO_SMOKES_TEXT);
    const same = within(dialog).getByRole('button', { name: 'The same smoke' });
    const other = within(dialog).getByRole('button', { name: 'A different smoke' });
    expect(same.dataset.preselected).toBe('true');
    expect(other.dataset.preselected).toBe('false');
    expect(s.entries()).toBe(2);
    fireEvent.click(same);
    expect(s.entries()).toBe(3);
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
  });

  it('with an old smoke open: "a different smoke" is preselected, and choosing it starts one', async () => {
    const maxAgeMs = createFakeEnvironment().environment.parameters.maxIncidentAgeMs;
    const old = postsIncident(['west', 'east'], (_p, i) => ({
      bearing: { timeUtcMs: 1_790_000_000_000 - maxAgeMs - 60_000 * (i + 1) },
    }));
    const s = mount(storedWith([old]));
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    expect(
      within(dialog).getByRole('button', { name: 'A different smoke' }).dataset.preselected,
    ).toBe('true');
    expect(within(dialog).getByRole('button', { name: 'The same smoke' }).dataset.preselected).toBe(
      'false',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'A different smoke' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(2);
    expect(s.entries()).toBe(1);
  });

  it('is gone after Take another, and adds nothing for the capture left unanswered', async () => {
    const s = mount(storedWith([postsIncident(['west', 'east'])]));
    await s.captureOnCrosshair();
    expect(s.getByTestId('confirm-smoke')).toBeTruthy();
    await s.press('again');
    expect(s.queryByTestId('confirm-smoke')).toBeNull();
    expect(s.entries()).toBe(2);
  });

  it('shows a refused answer beside the answers, and stays on the screen', async () => {
    const s = mount({}, { randomAvailable: false });
    await s.captureOnCrosshair();
    const dialog = s.getByTestId('confirm-smoke');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Start a new smoke with this sighting' }),
    );
    const m = messageFor({ ok: false, reason: 'random_unavailable' });
    expect(within(dialog).getByRole('alert').textContent).toBe(`${m.whatHappened} ${m.whatToDo}`);
    expect(s.store.getSnapshot().state.incidents).toHaveLength(0);
    expect(s.calls).toEqual([]);
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
