// A failing `advanceTo` (Req 17.6): the real Simulator, except that its controls refuse to
// advance on demand, which no script can cause.

import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { messageFor } from '../math/messages';
import { buildCatalogue } from '../math/scene/catalogue';
import { fakeObserver } from '../test-support/fake-observe';
import { FakeTimer } from '../test-support/fake-timer';
import { PARAMETERS } from '../test-support/session-fixtures';
import { SimulatorPanel } from './SimulatorPanel';

const refusal = vi.hoisted(() => ({ on: false }));

vi.mock('@alidade/sensors', async (importOriginal) => {
  const real = await importOriginal<typeof import('@alidade/sensors')>();
  return {
    ...real,
    createSimulator: (...args: Parameters<typeof real.createSimulator>) => {
      const made = real.createSimulator(...args);
      if (!made.ok) return made;
      const { controls } = made.value;
      return {
        ...made,
        value: {
          ...made.value,
          controls: {
            ...controls,
            advanceTo: (t: number) =>
              refusal.on
                ? { ok: false as const, reason: 'invalid_number' as const, field: 'timeUtcMs' }
                : controls.advanceTo(t),
          },
        },
      };
    },
  };
});

describe('SimulatorPanel when advanceTo fails (Req 17.6)', () => {
  it('pauses, shows the Message of the failure and keeps its state', async () => {
    const built = buildCatalogue();
    if (!built.ok) throw new Error(built.reason);
    const timer = new FakeTimer();
    const utils = render(
      <SimulatorPanel
        catalogue={built.value}
        timer={timer}
        parameters={PARAMETERS}
        sensorOptions={{
          listeningTimeoutMs: 3000,
          positionTimeoutMs: 30_000,
          positionConfidenceScale: 1,
        }}
        tapSigmaPx={1}
        observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
      />,
    );
    const q = within(utils.container);
    await act(async () => {
      fireEvent.click(utils.container.querySelector('[data-control="start"]') as HTMLElement);
    });
    await act(async () => {
      fireEvent.click(q.getByText('Play'));
    });
    const running = timer.running();
    refusal.on = true;
    await act(async () => {
      timer.advance(100);
    });
    const m = messageFor({ ok: false, reason: 'invalid_number' });
    expect(q.getByRole('alert').textContent).toBe(m.whatHappened + m.whatToDo);
    expect((q.getByText('Play') as HTMLButtonElement).disabled).toBe(false);
    expect((q.getByText('Pause') as HTMLButtonElement).disabled).toBe(true);
    expect(timer.running()).toBe(running - 1);
    expect(q.getByTestId('sighting-screen').dataset.state).toBe('starting');
    refusal.on = false;
  });
});
