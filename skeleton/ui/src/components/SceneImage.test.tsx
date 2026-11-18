import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectedScene } from '../math/scene/project-scene';
import { FIXTURE_LAYOUT } from '../test-support/session-fixtures';
import { SceneImage } from './SceneImage';

const PROJECTED: ProjectedScene = {
  focalPx: 500,
  horizon: { a: { xPx: 0, yPx: 400 }, b: { xPx: 390, yPx: 420 } },
  targets: [
    {
      id: 'tower',
      kind: 'landmark',
      label: 'Tower',
      point: { xPx: 100, yPx: 200 },
      visible: true,
      radiusPx: null,
    },
    {
      id: 'hidden',
      kind: 'landmark',
      label: 'Behind',
      point: null,
      visible: false,
      radiusPx: null,
    },
    {
      id: 'sun',
      kind: 'sun',
      label: 'Sun',
      point: { xPx: 250, yPx: 150 },
      visible: true,
      radiusPx: 4,
    },
  ],
};

describe('SceneImage (Req 16.5, 16.6)', () => {
  it('draws the horizon, the visible Targets with their labels and the Sun as a disc', () => {
    const { container } = render(<SceneImage projected={PROJECTED} layout={FIXTURE_LAYOUT} />);
    const horizon = container.querySelector('[data-part="horizon"]');
    expect(horizon?.getAttribute('y1')).toBe('400');
    expect(horizon?.getAttribute('y2')).toBe('420');
    const targets = [...container.querySelectorAll('[data-part="target"]')];
    expect(targets.map((t) => t.getAttribute('data-target-id'))).toEqual(['tower', 'sun']);
    expect(targets.map((t) => t.textContent)).toEqual(['Tower', 'Sun']);
    expect(container.querySelector('[data-kind="sun"] circle')?.getAttribute('r')).toBe('4');
    expect(container.querySelector('[data-kind="landmark"] circle')).toBeNull();
  });

  it('shows no text that gives a direction', () => {
    const { container } = render(<SceneImage projected={PROJECTED} layout={FIXTURE_LAYOUT} />);
    expect(container.textContent).toBe('TowerSun');
    expect(container.textContent).not.toMatch(/[°\d]/);
  });

  it('draws no horizon when it is not in view, and nothing without a projection', () => {
    const { container, rerender } = render(
      <SceneImage projected={{ ...PROJECTED, horizon: null }} layout={FIXTURE_LAYOUT} />,
    );
    expect(container.querySelector('[data-part="horizon"]')).toBeNull();
    rerender(<SceneImage projected={null} layout={null} />);
    expect(container.querySelectorAll('[data-part="target"]')).toHaveLength(0);
  });
});
