// The next step is always on the screen (design D23; task 23.9; the lead's complaint "do I have to
// go back and tap the map?"). The whole flow in the App, in device mode with fakes: at every step the
// screen has exactly one primary control and it names the next step, or, in a view of equal choices,
// those choices; every view opens at the top; no screen after a Capture holds "Take another"; and
// after a success nothing leaves the user on a form.

import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createFakeEnvironment } from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { deviceSource } from '../test-support/device-sight';
import { canonicalOf } from '../test-support/incident-fixtures';
import { START_UTC_MS } from '../test-support/fake-environment';
import { createVigiaStore } from './store';

const DEG = Math.PI / 180;
const OTHER_SMOKE = 'M7PQ3MWXA2';

function mountApp() {
  const device = deviceSource();
  const fake = createFakeEnvironment({
    map: new FakeMapLibre(),
    sighting: device.sighting,
    href: 'https://app.example.test/',
  });
  const store = createVigiaStore(fake.environment);
  store.start();
  const utils = render(
    <App
      environment={fake.environment}
      store={store}
      hasDeviceOrientation
      onModeChange={() => {}}
    />,
  );
  const settle = async (fn: () => void = () => undefined) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  const main = () => utils.getByTestId('app-main');
  const primaries = () =>
    [...utils.container.querySelectorAll<HTMLElement>('[data-primary="true"]')].map(
      (b) => b.textContent,
    );
  const tap = (name: string | RegExp) =>
    settle(() => fireEvent.click(utils.getByRole('button', { name })));
  const press = (id: string) =>
    settle(() => {
      const el = utils.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
      if (el === null) throw new Error(`no control ${id}`);
      fireEvent.click(el);
    });
  const advance = async (ms: number) => {
    for (let t = 50; t <= ms; t += 50) {
      await settle(() => {
        device.sensors.controls?.advanceTo(device.script.startUtcMs + t);
        fake.timer.advance(50);
      });
    }
  };
  return { ...utils, store, settle, main, primaries, tap, press, advance };
}

describe('the flow from a first sighting to a joined smoke, step by step', () => {
  it('names the next step on every screen', async () => {
    const a = mountApp();
    await a.settle();

    // 1. Nothing yet: the one thing to do is to sight.
    expect(a.primaries()).toEqual(['Sight the smoke']);

    // 2. The Sight screen: Start, then the current action at every step; Back is the only other row.
    await a.tap('Sight the smoke');
    expect(a.getByTestId('sighting-screen').dataset.layout).toBe('docked');
    expect(a.primaries()).toEqual(['Start']);
    await a.press('start');
    await a.advance(1500);
    expect(a.primaries()).toEqual(['Freeze']);
    await a.press('freeze');
    expect(a.primaries()).toEqual(['Capture']);

    // 3. A first Capture starts the smoke: the Smoke screen, at its top, with "Send this sighting".
    a.main().scrollTop = 250;
    await a.press('capture');
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
    expect(a.main().scrollTop).toBe(0);
    // Mira draws the line of Req 4.11 as "Sighting saved", the numeral and its 1-sigma; the sentence
    // is the name of its line.
    expect(a.getByTestId('status-line').getAttribute('aria-label')).toMatch(
      /Sighting saved: .*° ± .*° \(true\)/,
    );
    expect(a.primaries()).toEqual(['Send this sighting']);
    expect(a.queryByRole('button', { name: 'Take another' })).toBeNull();
    expect(a.store.getSnapshot().state.incidents).toHaveLength(1);

    // 4. "Send this sighting" opens the sheet: its two choices are cards of one size, the QR (someone
    // beside you) first and in the yellow, as Mira draws it; nothing was sent.
    await a.tap('Send this sighting');
    const sheet = a.getByTestId('share-sheet');
    expect(a.primaries()).toEqual([]);
    const qr = within(sheet).getByRole('button', { name: 'Show QR code (someone beside you)' });
    const send = within(sheet).getByRole('button', { name: 'Send link (someone far away)' });
    expect(qr.style.minHeight).toBe(send.style.minHeight);
    expect(qr.style.borderRadius).toBe(send.style.borderRadius);
    expect(qr.dataset.choice).toBe(send.dataset.choice);
    expect(a.store.getSnapshot().open?.incident.entries[0]?.shared).toEqual([]);

    // 5. The QR is a view of its own, at the top, with Back to the sheet; Close returns to the smoke.
    a.main().scrollTop = 300;
    await a.settle(() => fireEvent.click(qr));
    expect(a.getByTestId('qr-view')).toBeTruthy();
    expect(a.main().scrollTop).toBe(0);
    await a.tap('Back');
    expect(a.getByTestId('share-sheet')).toBeTruthy();
    await a.tap('Close');
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
    expect(a.primaries()).toEqual(['Sight the smoke']);

    // 6. A code arrives from the other phone: "the same smoke" asks once, in a view of its own.
    await a.tap(/Add a sighting someone sent me/);
    const code = canonicalOf(
      5,
      OTHER_SMOKE,
      {
        azimuthRad: 45.5 * DEG,
        azimuthSigmaRad: 2 * DEG,
        positionAccuracyM: 8,
        timeUtcMs: START_UTC_MS - 60_000,
      },
      'received',
    ).code;
    fireEvent.change(a.getByLabelText('Paste the link or the code'), { target: { value: code } });
    await a.tap('Read the code');
    await a.tap('It is the same smoke as the one I have open');
    expect(a.getByTestId('confirm-view')).toBeTruthy();
    expect(a.queryByTestId('inbox-card')).toBeNull();

    // 7. Join ends on the Smoke screen, at its top, with the line and the new result.
    a.main().scrollTop = 200;
    await a.tap('Join the two smokes');
    expect(a.queryByTestId('inbox-sheet')).toBeNull();
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
    expect(a.main().scrollTop).toBe(0);
    expect(a.getByTestId('smoke-screen').textContent).toContain('Joined: 2 sightings');
    expect(a.primaries()).toEqual(['Sight the smoke']);
    expect(a.store.getSnapshot().state.incidents).toHaveLength(1);
  });

  it('after the first capture the line and the primary action go when the user leaves the screen', async () => {
    const a = mountApp();
    await a.settle();
    await a.tap('Sight the smoke');
    await a.press('start');
    await a.advance(1500);
    await a.press('freeze');
    await a.press('capture');
    expect(a.primaries()).toEqual(['Send this sighting']);
    await a.settle(() => fireEvent.click(a.getByRole('tab', { name: 'Sightings' })));
    await a.settle(() => fireEvent.click(a.getByRole('tab', { name: 'Smoke' })));
    expect(a.getByTestId('smoke-screen').textContent).not.toContain('Sighting saved');
    expect(a.primaries()).toEqual(['Sight the smoke']);
  });
});
