// How icons are used (Req 22.8 as amended 2026-11-27, task 35.4): an icon always stands beside
// visible text that says the same; no button and no link is an icon alone unless it is named by its
// `aria-label` (Mira's round Back); only the components draw icons (not the Math layer, not the
// Adapters). A scan of the package's source, and a check of a rendered tree.

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeObserver } from '../test-support/fake-observe';
import { PARAMETERS, sessionInState } from '../test-support/session-fixtures';
import { Icon } from './Icon';
import { SightingScreen } from './SightingScreen';

/** The buttons and links of a rendered tree whose only content is an icon (no text, no name). */
export function iconOnlyControls(root: ParentNode): string[] {
  return [...root.querySelectorAll('button, a, [role="button"], summary')]
    .filter((el) => el.querySelector('svg') !== null && (el.textContent ?? '').trim() === '')
    .filter((el) => (el.getAttribute('aria-label') ?? '').trim() === '')
    .map((el) => el.outerHTML.slice(0, 80));
}

/** A `<button>` or an `<a>` with no `aria-label` whose JSX children are one `<Icon …/>` alone. */
const ICON_ONLY_JSX = /<(button|a)\b(?:(?!aria-label)[^>])*>\s*<Icon\b[^>]*\/>\s*<\/\1>/;

const GLOBBED = import.meta.glob<string>('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(GLOBBED)
    .map(([key, source]) => [new URL(key, import.meta.url).pathname, source] as const)
    .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.includes('/test-support/')),
);

describe('iconOnlyControls', () => {
  it('finds a button whose only content is an icon, and leaves one with words alone', () => {
    const { container } = render(
      <div>
        <button type="button">
          <Icon name="share" />
        </button>
        <button type="button">
          <Icon name="share" />
          Share
        </button>
        <a href="#back">
          <Icon name="chevron-left" />
          Back
        </a>
      </div>,
    );
    expect(iconOnlyControls(container)).toHaveLength(1);
  });
});

describe('the source of the UI (Req 22.8)', () => {
  it('reads the source', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(40);
  });

  it('has no button and no link that is an icon alone', () => {
    const found = Object.entries(SOURCES)
      .filter(([, source]) => ICON_ONLY_JSX.test(source))
      .map(([path]) => path);
    expect(found).toEqual([]);
  });

  it('the scan bites: an icon-only button planted in a source is found', () => {
    expect(ICON_ONLY_JSX.test('<button type="button">\n  <Icon name="trash" />\n</button>')).toBe(
      true,
    );
    expect(
      ICON_ONLY_JSX.test('<button type="button">\n  <Icon name="trash" />\n  Delete\n</button>'),
    ).toBe(false);
    // Named by its label, as Mira's round Back is: not an icon alone for a screen reader.
    expect(
      ICON_ONLY_JSX.test(
        '<button type="button" aria-label="Back">\n  <Icon name="chevron-left" />\n</button>',
      ),
    ).toBe(false);
  });

  it('draws icons only in the components: not in the Math layer, not in the Adapters', () => {
    const found = Object.entries(SOURCES)
      .filter(([path]) => /\/src\/(math|adapters)\//.test(path))
      .filter(([, source]) => /\bfrom\s+'lucide-react'|<Icon\b|from\s+'[^']*\/Icon'/.test(source))
      .map(([path]) => path);
    expect(found).toEqual([]);
  });

  it('imports lucide-react in Icon.tsx alone', () => {
    const found = Object.entries(SOURCES)
      .filter(([, source]) => /\bfrom\s+'lucide-react'/.test(source))
      .map(([path]) => path.replace(/^.*\/src\//, 'src/'));
    expect(found).toEqual(['src/components/Icon.tsx']);
  });
});

// The rendered screens (task 35.10's mutation check showed the source scan misses a button whose
// attributes hold an arrow function): no control of the sighting screen is an icon alone.
describe('the rendered sighting screen (Req 22.8)', () => {
  it('has no control that is an icon alone, in every state, docked and in flow, and in "Other ways"', () => {
    for (const layout of ['docked', 'flow'] as const) {
      for (const state of [
        'permission',
        'starting',
        'live',
        'frozen',
        'captured',
        'failed',
      ] as const) {
        const { container, unmount, queryByRole } = render(
          <SightingScreen
            session={sessionInState(state, 'bearing').session}
            parameters={PARAMETERS}
            onRequestPermission={vi.fn()}
            onAction={vi.fn()}
            sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
            fit="cover"
            calibration={null}
            tapSigmaPx={Number.NaN}
            observe={fakeObserver({ widthPx: 390, heightPx: 664 }).observe}
            renderImage={() => <div />}
            layout={layout}
            controlIcons={{
              start: 'camera',
              capture: 'camera',
              unfreeze: 'video',
              'north-compass': 'compass',
            }}
          />,
        );
        expect(iconOnlyControls(container), `${layout} ${state}`).toEqual([]);
        const other = queryByRole('button', { name: 'Other ways to set north' });
        if (other !== null) {
          fireEvent.click(other);
          expect(iconOnlyControls(container), `${layout} ${state} other ways`).toEqual([]);
        }
        unmount();
      }
    }
  });
});
