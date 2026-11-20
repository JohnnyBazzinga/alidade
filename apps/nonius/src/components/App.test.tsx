// The App: the tabs, the three full screens, the primary-action row and the banner (design §9).

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { appWrap } from '../test-support/app-wrap';
import { createNoniusStore } from './store';
import { testEnvironment } from '../test-support/test-environment';

function mount(over = {}) {
  const t = testEnvironment(over);
  const store = createNoniusStore(t.environment);
  const utils = render(<App environment={t.environment} store={store} />);
  void appWrap;
  return { t, store, ...utils, q: within(utils.container) };
}

const tab = (q: ReturnType<typeof within>, name: string) => q.getByRole('tab', { name });

describe('App', () => {
  it('opens on the Fix tab with the three tabs', () => {
    const m = mount();
    expect(m.q.getByTestId('fix-screen')).toBeTruthy();
    expect(tab(m.q, 'Fix').getAttribute('aria-selected')).toBe('true');
    expect(m.q.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Fix', 'Sights', 'Map']);
  });

  it('moves between the tabs', () => {
    const m = mount();
    fireEvent.click(tab(m.q, 'Sights'));
    expect(m.q.getByTestId('sights-screen')).toBeTruthy();
    fireEvent.click(tab(m.q, 'Map'));
    expect(m.q.getByTestId('map-screen')).toBeTruthy();
    fireEvent.click(tab(m.q, 'Fix'));
    expect(m.q.getByTestId('fix-screen')).toBeTruthy();
  });

  it('puts the screen’s primary action in the row between the scrolling part and the tab bar', () => {
    const m = mount();
    const row = m.q.getByTestId('primary-row');
    expect(within(row).getByRole('button', { name: 'Sight the Sun' })).toBeTruthy();
    expect(m.q.getByTestId('app-main').contains(row)).toBe(false);
    const shell = m.q.getByTestId('app-shell');
    const order = [...shell.children].map((c) => (c as HTMLElement).dataset.testid);
    expect(order.indexOf('app-main')).toBeLessThan(order.indexOf('primary-row'));
    expect(order.indexOf('primary-row')).toBeLessThan(order.indexOf('tab-bar'));
  });

  it('opens the Sight screen from the primary action, without the tab bar, and Done returns', () => {
    const m = mount();
    fireEvent.click(
      within(m.q.getByTestId('primary-row')).getByRole('button', { name: 'Sight the Sun' }),
    );
    expect(m.q.getByTestId('sight-screen')).toBeTruthy();
    expect(m.q.queryByTestId('tab-bar')).toBeNull();
    fireEvent.click(within(m.q.getByTestId('primary-row')).getByRole('button', { name: 'Done' }));
    expect(m.q.getByTestId('fix-screen')).toBeTruthy();
    expect(m.q.getByTestId('tab-bar')).toBeTruthy();
  });

  it('opens the Index error screen and comes back on Cancel', () => {
    const m = mount();
    fireEvent.click(m.q.getByRole('button', { name: 'Measure the index error' }));
    expect(m.q.getByTestId('index-error-screen')).toBeTruthy();
    fireEvent.click(m.q.getByRole('button', { name: 'Cancel' }));
    expect(m.q.getByTestId('fix-screen')).toBeTruthy();
  });

  it('opens How it works and comes back on Back', () => {
    const m = mount();
    fireEvent.click(m.q.getByRole('button', { name: 'How it works' }));
    expect(m.q.getByTestId('how-it-works')).toBeTruthy();
    fireEvent.click(m.q.getByRole('button', { name: 'Back' }));
    expect(m.q.getByTestId('fix-screen')).toBeTruthy();
  });

  it('shows no banner on a phone and a banner, in the flow, in Simulation mode', () => {
    expect(mount().q.queryByTestId('simulation-banner')).toBeNull();
    const m = mount({ mode: 'simulation' });
    const banner = m.q.getByTestId('simulation-banner');
    expect(banner.style.position).toBe('');
    expect(m.q.getByTestId('app-shell').firstElementChild).toBe(banner);
  });

  it('shows what the shell hands it under the banner (the phone bar), and not on a phone', () => {
    const t = testEnvironment({ mode: 'simulation' });
    const store = createNoniusStore(t.environment);
    const { getByTestId } = render(
      <App environment={t.environment} store={store} phoneBar={<p data-testid="bar">bar</p>} />,
    );
    const shell = getByTestId('app-shell');
    expect([...shell.children].map((c) => (c as HTMLElement).dataset.testid).slice(0, 2)).toEqual([
      'simulation-banner',
      'bar',
    ]);
  });
});
