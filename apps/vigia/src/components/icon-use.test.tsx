// No control of Vigia is an icon alone (Req 22.11, skeleton-ui Req 22.8): every button, link and
// summary that holds an icon also holds words. Checked on the rendered App, on every tab and on the
// views opened from them, in both modes.

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createFakeEnvironment } from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { postsIncident } from '../test-support/geometry-fixtures';
import { storedWith } from '../test-support/render-screen';
import { createVigiaStore } from './store';

/** The controls whose only content is an icon (no words). */
function iconOnlyControls(root: ParentNode): string[] {
  return [...root.querySelectorAll('button, a, [role="button"], summary')]
    .filter((el) => el.querySelector('svg') !== null && (el.textContent ?? '').trim() === '')
    .map((el) => el.outerHTML.slice(0, 90));
}

describe('no icon-only control (Req 22.11)', () => {
  it('bites: a button that holds only an icon is found', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<button><svg data-icon="share"></svg></button><button><svg></svg>Share</button>';
    expect(iconOnlyControls(div)).toHaveLength(1);
  });

  for (const mode of ['device', 'simulation'] as const) {
    it(`on every tab and view, ${mode} mode`, () => {
      const fake = createFakeEnvironment({
        map: new FakeMapLibre(),
        mode,
        storedItems: storedWith([postsIncident(['west', 'east', 'side'])]),
      });
      const store = createVigiaStore(fake.environment);
      store.start();
      const u = render(<App environment={fake.environment} store={store} hasDeviceOrientation />);
      const check = (where: string) => expect(iconOnlyControls(u.container), where).toEqual([]);
      for (const tab of ['Smoke', 'Sightings', 'Map', 'Emergency']) {
        fireEvent.click(u.getByRole('tab', { name: tab }));
        check(tab);
      }
      fireEvent.click(u.getByRole('tab', { name: 'Sightings' }));
      fireEvent.click(u.getAllByRole('button', { name: 'Share' })[0] as HTMLElement);
      check('Share');
      fireEvent.click(u.getByRole('button', { name: 'Close' }));
      fireEvent.click(u.getByRole('tab', { name: 'Smoke' }));
      fireEvent.click(u.getByRole('button', { name: /Add a sighting someone sent me/ }));
      check('Inbox');
      u.unmount();
    });
  }
});
