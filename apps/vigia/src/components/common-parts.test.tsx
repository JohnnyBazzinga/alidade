// The common parts of the screens (Req 16.1, 16.2, 17.4, design §9): the limits block, the
// guidance on how to sight smoke, the Simulation banner and the tab bar.

import { COLOURS, SIZES } from '@alidade/ui';
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIX_ASSUMPTION_TEXT, SIMULATION_TEXT, sightingGuidance } from '../math/texts';
import { WORDS_FIXTURE } from '../test-support/words-fixture';
import { GuidanceBlock } from './GuidanceBlock';
import { LimitsBlock } from './LimitsBlock';
import { SimulationBanner } from './SimulationBanner';
import { TabBar, TABS } from './TabBar';

describe('LimitsBlock (Req 16.1)', () => {
  it('shows UI\u2019s limits note with every Bearing', () => {
    const { getByTestId, container } = render(<LimitsBlock withFix={false} />);
    expect(getByTestId('limits-note').textContent).toContain(
      'Phone compasses are off by several degrees.',
    );
    expect(container.textContent).not.toContain(FIX_ASSUMPTION_TEXT);
  });

  it('with a Fix, also says under what assumption the ellipse is 95 %', () => {
    const { getByTestId, container } = render(<LimitsBlock withFix />);
    expect(getByTestId('limits-note')).toBeTruthy();
    expect(container.textContent).toContain(FIX_ASSUMPTION_TEXT);
  });
});

// Requirement change (Req 3.7 and 16.2 as amended 2026-11-21, task 23.4): the first form showed the
// four sentences in view before the first capture and folded them after it ("collapsed"); the
// amended form is one visible line and a closed "How to aim" disclosure, the same in every state.
describe('GuidanceBlock (Req 3.7, 16.2)', () => {
  it('shows one line and holds every sentence of how to aim in a closed disclosure', () => {
    const { getByTestId } = render(<GuidanceBlock windShown={false} />);
    const block = getByTestId('guidance');
    const details = block.querySelector('details');
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain(
      'Aim at the base of the smoke',
    );
    expect(details?.querySelector('summary')?.textContent).toContain('How to aim');
    for (const sentence of sightingGuidance(false)) {
      expect(details?.querySelector('ul')?.textContent).toContain(sentence);
    }
  });

  it('with a wind reading shown, says that the smoke leans downwind', () => {
    const { getByTestId } = render(<GuidanceBlock windShown />);
    const last = sightingGuidance(true).at(-1) ?? '';
    expect(last).toContain('downwind');
    expect(getByTestId('guidance').querySelector('ul')?.textContent).toContain(last);
  });

  it('without a wind reading, does not say it', () => {
    const { getByTestId } = render(<GuidanceBlock windShown={false} />);
    expect(getByTestId('guidance').textContent).not.toContain('downwind');
  });
});

describe('SimulationBanner (Req 17.4)', () => {
  it('says the scene is not a real place, in the page\u2019s flow', () => {
    const { getByTestId } = render(<SimulationBanner />);
    const banner = getByTestId('simulation-banner');
    expect(banner.textContent).toBe('SIMULATION: synthetic scene, not a real place.');
    expect(banner.style.position).toBe('');
  });

  it('uses the one wording of the simulation: the first line of the Emergency text (follow-up 3)', () => {
    const { getByTestId } = render(<SimulationBanner />);
    const first = WORDS_FIXTURE.fixes[0]?.emergency.simulation.split('\n')[0];
    expect(first).toBe(SIMULATION_TEXT);
    expect(getByTestId('simulation-banner').textContent).toBe(SIMULATION_TEXT);
  });
});

describe('TabBar (design §9)', () => {
  it('has the four tabs in order, the current one marked', () => {
    const { getAllByRole } = render(
      <TabBar current="map" inboxCount={0} onSelect={() => undefined} />,
    );
    const tabs = getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Smoke', 'Sightings', 'Map', 'Emergency']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
    expect(TABS.map((t) => t.id)).toEqual(['smoke', 'sightings', 'map', 'emergency']);
  });

  it('selects a tab on a tap', () => {
    const chosen: string[] = [];
    const { getByRole } = render(
      <TabBar current="smoke" inboxCount={0} onSelect={(t) => void chosen.push(t)} />,
    );
    fireEvent.click(getByRole('tab', { name: 'Emergency' }));
    expect(chosen).toEqual(['emergency']);
  });

  it('every tab is a touch target of at least 48 px, in UI\u2019s colours', () => {
    const { getAllByRole } = render(
      <TabBar current="smoke" inboxCount={0} onSelect={() => undefined} />,
    );
    for (const tab of getAllByRole('tab')) {
      expect(Number.parseFloat(tab.style.minHeight)).toBeGreaterThanOrEqual(SIZES.touchPx);
      expect(Object.values(COLOURS).map((c) => c.toLowerCase())).toContain(
        rgbToHex(tab.style.color),
      );
    }
  });

  it('shows on the Smoke tab how many sightings wait in the Inbox', () => {
    const { getByRole } = render(
      <TabBar current="map" inboxCount={2} onSelect={() => undefined} />,
    );
    const smoke = getByRole('tab', { name: /Smoke/ });
    expect(within(smoke).getByTestId('inbox-badge').textContent).toBe('2');
  });
});

/** `rgb(r, g, b)` as jsdom writes a colour, to `#rrggbb`. */
function rgbToHex(rgb: string): string {
  const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgb);
  if (m === null) return rgb.toLowerCase();
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}
