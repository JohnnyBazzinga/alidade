// The spike of task 35.1 (Req 22.4, design D37.3, Open question 17): does the simulated DOM keep
// `var(--alidade-…)` in the inline styles that the components use, and in the root's custom
// properties? The mechanism of themes (CSS custom properties, `var()` in inline styles) stands only
// if it does. This test documents the answer, property by property, and fails if jsdom changes it.

import { render } from '@testing-library/react';
import type { CSSProperties } from 'react';
import { describe, expect, it } from 'vitest';

const INK = 'var(--alidade-ink)';

/** What `element.style[prop]` holds after React set it from a `style` prop. */
function readBack(style: CSSProperties, prop: string, tag: 'div' | 'svg-rect' = 'div'): string {
  const { container, unmount } =
    tag === 'div'
      ? render(<div style={style} />)
      : render(
          <svg>
            <rect style={style} />
          </svg>,
        );
  const el = container.querySelector(tag === 'div' ? 'div' : 'rect') as HTMLElement | SVGElement;
  const value = Reflect.get(el.style, prop) as string;
  unmount();
  return value;
}

describe('var() in an inline style, in the simulated DOM (task 35.1)', () => {
  // The properties that the components set from a colour today, one at a time.
  it.each([
    ['color', { color: INK }],
    ['background', { background: INK }],
    ['backgroundColor', { backgroundColor: INK }],
    ['borderLeft', { borderLeft: `4px solid ${INK}` }],
    ['border', { border: `1px solid ${INK}` }],
    ['borderTopColor', { borderTopColor: INK }],
    ['borderColor', { borderColor: INK }],
    ['outline', { outline: `2px solid ${INK}` }],
    ['boxShadow', { boxShadow: `0 1px 2px ${INK}` }],
    ['borderRadius', { borderRadius: 'var(--alidade-card-radius)' }],
  ] as const)('keeps var() in %s', (prop, style) => {
    const got = readBack(style as CSSProperties, prop);
    expect(got).toContain('var(--alidade-');
  });

  it('keeps env() inside calc() in a padding, which the docked bar already uses', () => {
    expect(
      readBack({ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }, 'paddingBottom'),
    ).toBe('calc(8px + env(safe-area-inset-bottom))');
  });

  it('keeps var() in a gradient background', () => {
    const got = readBack(
      { background: 'linear-gradient(var(--alidade-header), var(--alidade-header-end))' },
      'background',
    );
    expect(got).toContain('var(--alidade-header)');
  });

  it('keeps var() in the paint of an SVG shape set in its style (fill, stroke)', () => {
    expect(readBack({ fill: INK }, 'fill', 'svg-rect')).toContain('var(--alidade-ink)');
    expect(readBack({ stroke: INK }, 'stroke', 'svg-rect')).toContain('var(--alidade-ink)');
  });

  it('keeps a custom property written on the root, and replaces it', () => {
    const root = document.documentElement;
    root.style.setProperty('--alidade-ink', '#0E1E33');
    expect(root.style.getPropertyValue('--alidade-ink')).toBe('#0E1E33');
    root.style.setProperty('--alidade-ink', '#EAF0F7');
    expect(root.style.getPropertyValue('--alidade-ink')).toBe('#EAF0F7');
    root.style.removeProperty('--alidade-ink');
    expect(root.style.getPropertyValue('--alidade-ink')).toBe('');
  });
});
