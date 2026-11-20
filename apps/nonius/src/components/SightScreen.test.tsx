// The Sight screen (Req 4.1 to 4.9, 6.5; design §9): UI's `DeviceSighting` with the kind altitude,
// no location ever asked, the guidance in view, the Sun side recorded from the Frozen sighting,
// and each refusal's Message beside the control.

import { defaultSessionParameters } from '@alidade/ui';
import { act, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { appWrap } from '../test-support/app-wrap';
import { fakeCameraSurface } from '../test-support/fake-camera';
import { sightOf } from '../test-support/captures';
import { renderScreen } from '../test-support/render-screen';
import { sunSensors, SUN_SCRIPT } from '../test-support/sun-sensors';
import { testEnvironment } from '../test-support/test-environment';
import { SightScreen } from './SightScreen';

const SESSION_PARAMETERS = {
  ...defaultSessionParameters(),
  altitudeCalibration: { offsetRad: 0, sigmaRad: 0 },
};

function mount(preload = 0) {
  const sensors = sunSensors();
  const t = testEnvironment({
    sighting: {
      kind: 'device',
      createSource: sensors.createSource,
      cameraSurface: fakeCameraSurface(),
      sessionParameters: SESSION_PARAMETERS,
    },
  });
  const w = appWrap(t);
  for (let i = 0; i < preload; i += 1)
    w.store.dispatch({ kind: 'capture', sight: sightOf({ id: `p${i}` }) });
  const onDone = vi.fn();
  const screen = renderScreen(<SightScreen onDone={onDone} />, w.wrap);
  const q = within(screen.container);
  const press = (id: string) =>
    screen.settle(() => {
      const el = screen.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
      if (el === null) throw new Error(`no control ${id}`);
      fireEvent.click(el);
    });
  const advance = async (ms: number) => {
    for (let at = 50; at <= ms; at += 50) {
      await screen.settle(() => {
        sensors.controls().advanceTo(SUN_SCRIPT.startUtcMs + at);
        t.timer.advance(50);
      });
    }
  };
  const takeSight = async () => {
    await press('start');
    await advance(1500);
    await press('freeze');
    await press('capture');
  };
  return { t, store: w.store, screen, q, onDone, sensors, press, advance, takeSight };
}

describe('SightScreen', () => {
  it('captures an altitude Sight through DeviceSighting and never asks for a location', async () => {
    const m = mount();
    await m.screen.settle();
    await m.takeSight();
    const sights = m.store.getSnapshot().state.sights;
    expect(sights).toHaveLength(1);
    expect(sights[0]?.rawApparentAltitudeRad).toBeGreaterThan(0.5);
    expect(sights[0]?.simulated).toBe(false);
    expect(sights[0]?.id).toMatch(/^sight-/);
    expect(m.sensors.calls.positionCalls).toBe(0);
    expect(m.t.locationCalls.count).toBe(0);
  });

  it('records the Sun side from the Frozen sighting, with its North reference', async () => {
    const m = mount();
    await m.screen.settle();
    await m.takeSight();
    const side = m.store.getSnapshot().state.sights[0]?.sunSide;
    expect(side).not.toBeNull();
    expect(['magnetic', 'true']).toContain(side?.northReference);
    expect(Number.isFinite(side?.azimuthRad)).toBe(true);
    expect(m.q.getByTestId('sight-taken').textContent).toMatch(/\d+\.\d° ± \d+\.\d°/);
    expect(m.q.getByTestId('sight-taken').textContent).toContain('Sun side: yes');
  });

  it('shows the guidance before the first sight and keeps it one tap away after', async () => {
    const m = mount();
    await m.screen.settle();
    const text = m.q.getByTestId('guidance').textContent ?? '';
    expect(text).toContain('look only at the screen, never at the Sun');
    expect(text).toContain('never through binoculars or any lens');
    expect(text).toContain('centre of the Sun');
    expect(text).toContain('hold still');
    expect(text).toContain('stay in one place');
    expect(m.q.getByTestId('guidance').querySelector('details')).toBeNull();
    await m.takeSight();
    expect(m.q.getByTestId('guidance').querySelector('details')).not.toBeNull();
  });

  it('shows the Calibration in use', async () => {
    const m = mount();
    await m.screen.settle();
    expect(m.q.getByTestId('calibration-line').textContent).toContain('never calibrated');
  });

  it('refuses a Sight beyond the set’s limit with its Message beside the controls, and stores nothing more', async () => {
    const m = mount(24);
    await m.screen.settle();
    await m.takeSight();
    expect(m.store.getSnapshot().state.sights).toHaveLength(24);
    const alert = within(m.screen.container).getByRole('alert');
    expect(alert.textContent).toContain('This set already holds as many sights as it can');
    expect(alert.textContent).not.toContain('sights_full');
  });

  it('says nothing is stored for a tap on the image: a tap is refused by the skeleton', async () => {
    const m = mount();
    await m.screen.settle();
    await m.press('start');
    await m.advance(1500);
    await m.press('freeze');
    const surface = m.q.getByTestId('image-surface');
    await m.screen.settle(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    });
    expect(m.q.queryByTestId('mark-ring')).toBeNull();
  });

  it('Done goes back and leaves the sights as they are', async () => {
    const m = mount();
    await m.screen.settle();
    await m.takeSight();
    act(() => fireEvent.click(m.q.getByRole('button', { name: 'Done' })));
    expect(m.onDone).toHaveBeenCalledTimes(1);
    expect(m.store.getSnapshot().state.sights).toHaveLength(1);
  });
});
