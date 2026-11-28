import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectedScene } from '../math/scene/project-scene';
import { FIXTURE_LAYOUT } from '../test-support/session-fixtures';
import { SceneImage } from './SceneImage';
import { applyTheme } from './theme/apply-theme';
import { field, instrument, mira } from './theme/themes';

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

// Mira (Req 22.18, D37.14): the Scene image as the design's landscape; every other theme as above.
describe('SceneImage in Mira (Req 22.18)', () => {
  afterEach(() => {
    applyTheme(document.documentElement, instrument);
    document.documentElement.removeAttribute('style');
  });
  const smoky: ProjectedScene = {
    ...PROJECTED,
    targets: [
      ...PROJECTED.targets,
      {
        id: 'smoke',
        kind: 'landmark',
        label: 'Smoke column',
        point: { xPx: 195, yPx: 300 },
        visible: true,
        radiusPx: null,
      },
    ],
  };

  it('draws the sky, the ground below the horizon, the Sun with its glow, the smoke as a plume', () => {
    applyTheme(document.documentElement, mira);
    const { container } = render(<SceneImage projected={smoky} layout={FIXTURE_LAYOUT} />);
    const svg = container.querySelector('[data-testid="scene-image"]') as SVGElement;
    expect(svg.dataset.variant).toBe('landscape');
    const ground = container.querySelector('[data-part="ground"]')?.getAttribute('d') ?? '';
    expect(ground.startsWith('M 0 400 L 390 420')).toBe(true);
    expect(container.querySelectorAll('[data-kind="sun"] circle')).toHaveLength(2);
    const smoke = container.querySelector('[data-target-id="smoke"]') as SVGElement;
    expect(smoke.querySelector('[data-part="plume"]')).not.toBeNull();
    expect(container.querySelector('[data-target-id="tower"] [data-part="plume"]')).toBeNull();
    // The label to the left of the crosshair's arms, in ink over a halo; still no direction.
    const label = smoke.querySelector('text') as SVGTextElement;
    expect(Number(label.getAttribute('x'))).toBe(195 - 44);
    expect(label.getAttribute('text-anchor')).toBe('end');
    expect(container.textContent).toBe('TowerSunSmoke column');
  });

  it('is the dark sky of D37.5 in Field', () => {
    applyTheme(document.documentElement, field);
    const { container } = render(<SceneImage projected={smoky} layout={FIXTURE_LAYOUT} />);
    expect(
      (container.querySelector('[data-testid="scene-image"]') as SVGElement).dataset.variant,
    ).toBeUndefined();
    expect(container.querySelector('[data-part="plume"]')).toBeNull();
  });
});
