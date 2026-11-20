// Drives the Simulation shell as a reviewer does (test support, not exported): choose a scene,
// Start, Freeze, Capture, answer the question, change the Station, open a tab. Used by the shell's
// tests and by the reviewer's integration test. Time moves only by the fake Timer.

import { defaultSessionParameters, type CatalogueScene, type Session } from '@alidade/ui';
import type { SimulatorContext } from '@alidade/ui';
import { act, fireEvent, render, within } from '@testing-library/react';
import { createClipboard } from '../adapters/clipboard';
import { createQrEncoder } from '../adapters/qr-encoder';
import { createRandom } from '../adapters/random';
import { SimulationShell } from '../components/simulation/SimulationShell';
import type { VigiaMode } from '../components/environment';
import { decodeSighting } from '../math/code/sighting-code';
import { defaultParameters } from '../math/parameters';
import { smokeScenes } from '../math/scenes/smoke-scenes';
import { createFakeCrypto, createFakeNavigator } from './fake-browser';
import { fixedSize } from './fake-camera';
import { FakeMapLibre, type FakeMap } from './fake-maplibre';
import { FakeTimer } from './fake-timer';
import { createRecordingGate } from './recording-gate';

export const SENSOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

/** The four scenes as the app has them. */
export function scenesOfTheApp(): readonly CatalogueScene[] {
  const built = smokeScenes();
  if (!built.ok) throw new Error(`smokeScenes: ${built.reason}`);
  return built.value;
}

/**
 * The scenes with the orientation noise set to 0 in every script (Req 17.7), so that a capture
 * can equal the Target's true azimuth to 1e-8 rad. Nothing else changes: the deliberate 12° of
 * `southwest` stays.
 */
export function noiseFree(scenes: readonly CatalogueScene[]): readonly CatalogueScene[] {
  return scenes.map((c) => ({
    ...c,
    scripts: Object.fromEntries(
      Object.entries(c.scripts).map(([id, s]) => [id, { ...s, orientationNoiseSigmaRad: 0 }]),
    ),
  }));
}

export interface MountOptions {
  readonly scenes?: readonly CatalogueScene[];
  readonly hasDeviceOrientation?: boolean;
}

export function mountSimulation(options: MountOptions = {}) {
  const parameters = defaultParameters();
  const timer = new FakeTimer();
  const lib = new FakeMapLibre();
  const gate = createRecordingGate();
  const qr = createQrEncoder(parameters);
  if (!qr.ok) throw new Error(`createQrEncoder: ${qr.reason}`);
  const sessions: { session: Session; context: SimulatorContext }[] = [];
  const modes: VigiaMode[] = [];
  const utils = render(
    <SimulationShell
      catalogue={options.scenes ?? scenesOfTheApp()}
      base={{
        parameters,
        timer,
        random: createRandom(createFakeCrypto()),
        clipboard: createClipboard(createFakeNavigator({})),
        gate,
        qr: qr.value,
        loadMap: () => Promise.resolve({ ok: true, value: lib }),
        tiles: null,
        tilesFailure: null,
      }}
      sessionParameters={defaultSessionParameters()}
      sensorOptions={SENSOR_OPTIONS}
      hasDeviceOrientation={options.hasDeviceOrientation ?? false}
      onModeChange={(mode) => void modes.push(mode)}
      observe={fixedSize(390, 844)}
      onSession={(session, context) => void sessions.push({ session, context })}
    />,
  );
  const q = within(utils.container);

  const settle = async (fn: () => void = () => undefined) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  const control = (id: string) => {
    const el = utils.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
    if (el === null) throw new Error(`no control ${id}`);
    return el;
  };
  const press = (id: string) => settle(() => fireEvent.click(control(id)));
  const click = (name: string | RegExp) =>
    settle(() => fireEvent.click(q.getByRole('button', { name })));
  const tab = (name: string) => settle(() => fireEvent.click(q.getByRole('tab', { name })));
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i += 1) await settle(() => timer.advance(100));
  };
  const sightingState = () => q.getByTestId('sighting-screen').dataset.state;
  const text = (testId: string) => q.getByTestId(testId).textContent ?? '';

  /** Taps the Target's pixel on the frozen Scene image. */
  const markTarget = async (targetId: string) => {
    const g = q
      .getByTestId('scene-image')
      .querySelector<SVGGElement>(`[data-target-id="${targetId}"]`);
    const x = g?.getAttribute('data-x-px');
    const y = g?.getAttribute('data-y-px');
    if (x == null || y == null) throw new Error(`target ${targetId} not visible`);
    const surface = q.getByTestId('image-surface');
    await settle(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: Number(x), clientY: Number(y) });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: Number(x), clientY: Number(y) });
    });
  };

  /** From the Smoke screen to the Sight screen. */
  const openSight = () => click('Sight the smoke');
  const chooseScene = (sceneId: string) =>
    settle(() => fireEvent.change(q.getByLabelText('Scene'), { target: { value: sceneId } }));
  /** The phone in hand, chosen under the banner (task 21.5): on any screen. */
  const chooseStation = (stationId: string) =>
    settle(() =>
      fireEvent.change(q.getByLabelText('You hold the phone at'), {
        target: { value: stationId },
      }),
    );
  /** Start, which also plays the script (task 21.4), and two seconds: the Session is live. */
  const toLive = async () => {
    await press('start');
    await ticks(20);
  };

  /**
   * One sighting by a reviewer: from the Smoke screen, to the Sight screen, the Station chosen,
   * live, frozen, captured by the crosshair or by a Mark on the smoke, and the question answered.
   * Back on the Smoke screen.
   */
  const sight = async (
    stationId: string,
    how: 'crosshair' | 'mark',
    answer: 'same' | 'new',
    smokeAlready = false,
  ) => {
    await openSight();
    await chooseStation(stationId);
    await toLive();
    await press('freeze');
    if (how === 'mark') await markTarget('smoke');
    await press('capture');
    if (sightingState() !== 'captured') throw new Error(`not captured: ${sightingState()}`);
    const label = smokeAlready
      ? answer === 'same'
        ? 'The same smoke'
        : 'A different smoke'
      : 'Start a new smoke with this sighting';
    await click(label);
  };

  /** The phone in hand becomes the one at `stationId`, by the chooser under the banner. */
  const switchTo = async (stationId: string) => {
    await chooseStation(stationId);
  };

  /**
   * From the Smoke screen of the phone in hand: Share this phone's own sighting to the phone at
   * `peerLabel` ("the phone at the east post"), then back on the Smoke screen.
   */
  const shareOwnSightingTo = async (peerLabel: string) => {
    await tab('Sightings');
    const rows = q.getAllByTestId('sighting-row');
    const own = rows.find((row) => (row.textContent ?? '').includes(', this phone'));
    if (own === undefined) throw new Error('this phone has no sighting of its own');
    await settle(() => fireEvent.click(within(own).getByRole('button', { name: 'Share' })));
    await click(`Send to ${peerLabel}`);
    await click('Close');
    await tab('Smoke');
  };

  /**
   * From the Smoke screen of the phone in hand: open the Inbox sheet and add every card, opening
   * the smoke as new where the phone does not have it; then back on the Smoke screen.
   */
  const addEverythingWaiting = async () => {
    await click(/Add a sighting someone sent me/);
    for (let guard = 0; guard < 10; guard += 1) {
      const cards = q.queryAllByTestId('inbox-card');
      const card = cards[0];
      if (card === undefined) break;
      const open = within(card).queryByRole('button', {
        name: 'Open it as a new smoke on this phone',
      });
      if (open !== null) {
        await settle(() => fireEvent.click(open));
        await click('Open it as a new smoke');
      } else {
        await settle(() => fireEvent.click(within(card).getByRole('button', { name: 'Add' })));
      }
    }
    await click('Close');
  };

  /**
   * From the Smoke screen of the phone in hand: open the Inbox sheet and add every card the way a
   * user does with a smoke open: "the same smoke" and its confirmation for a code of a smoke the
   * phone does not have, Add for one it does; then back on the Smoke screen.
   */
  const addByJoining = async () => {
    await click(/Add a sighting someone sent me/);
    for (let guard = 0; guard < 10; guard += 1) {
      const card = q.queryAllByTestId('inbox-card')[0];
      if (card === undefined) break;
      const same = within(card).queryByRole('button', {
        name: 'It is the same smoke as the one I have open',
      });
      if (same !== null) {
        await settle(() => fireEvent.click(same));
        await settle(() =>
          fireEvent.click(within(card).getByRole('button', { name: 'Join the two smokes' })),
        );
      } else {
        await settle(() => fireEvent.click(within(card).getByRole('button', { name: 'Add' })));
      }
    }
    await click('Close');
  };

  /**
   * The Incident id the phone in hand gives its first sighting's code: the code of the Share
   * sheet, decoded. From the Smoke screen, and back to it.
   */
  const incidentIdOfThisPhone = async (): Promise<string> => {
    await tab('Sightings');
    const row = q.getAllByTestId('sighting-row')[0];
    if (row === undefined) throw new Error('no sighting to share');
    await settle(() => fireEvent.click(within(row).getByRole('button', { name: 'Share' })));
    const shown = [...q.getByTestId('share-text').querySelectorAll('p')].map(
      (p) => p.textContent ?? '',
    );
    const grouped = shown.find((t) => /^[2-9A-HJKMNP-Z]{5}(-[2-9A-HJKMNP-Z]{5}){9}$/.test(t));
    if (grouped === undefined) throw new Error('no text code in the Share sheet');
    const decoded = decodeSighting(grouped, defaultParameters());
    if (!decoded.ok) throw new Error(`the code does not decode: ${decoded.reason}`);
    await click('Close');
    await tab('Smoke');
    return decoded.value.incidentId;
  };

  const map = (): FakeMap => lib.last();
  const alerts = () => q.queryAllByRole('alert').map((a) => a.textContent ?? '');
  return {
    ...utils,
    ...q,
    timer,
    lib,
    gate,
    sessions,
    modes,
    settle,
    control,
    press,
    click,
    tab,
    ticks,
    sightingState,
    text,
    markTarget,
    openSight,
    chooseScene,
    chooseStation,
    toLive,
    sight,
    switchTo,
    shareOwnSightingTo,
    addEverythingWaiting,
    addByJoining,
    incidentIdOfThisPhone,
    map,
    alerts,
  };
}
