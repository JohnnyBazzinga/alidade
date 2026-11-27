// The art's paints (design D25.4, task 24.2): every paint is a role (or the plume's grey) set in
// `style`, never a presentation attribute, which does not resolve `var()` (skeleton-ui Req 22.4).

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ART_COLOURS } from './art-colours';
import { BearingDial, HomeDial } from './Dials';
import { AppMark, Header } from './Header';
import { Schematic } from './Schematic';

const PLUME = new Set<string>(Object.values(ART_COLOURS).map((c) => c.toLowerCase()));

function paints(container: Element): string[] {
  const found: string[] = [];
  for (const el of container.querySelectorAll<SVGElement>('svg *')) {
    for (const attr of ['fill', 'stroke']) {
      const value = el.getAttribute(attr);
      if (value !== null) found.push(`${el.tagName} attribute ${attr}=${value}`);
    }
    for (const prop of ['fill', 'stroke'] as const) {
      const value = el.style[prop];
      if (value === '' || value === 'none' || value.startsWith('var(--alidade-')) continue;
      if (PLUME.has(value.toLowerCase()) || /^rgb/.test(value)) continue;
      found.push(`${el.tagName} style ${prop}=${value}`);
    }
  }
  return found;
}

describe('the art’s paints (D25.4)', () => {
  it('are roles in style, in the mark, the header, the dials and the schematic', () => {
    for (const node of [
      <AppMark key="m" />,
      <Header key="h" onEmergency={() => undefined} />,
      <HomeDial key="d" onSight={() => undefined} />,
      <BearingDial key="b" azimuthRad={1} sizePx={150} face label="dial" />,
      <BearingDial key="c" azimuthRad={1} sizePx={104} face={false} label="dial" />,
      <Schematic key="s" />,
    ]) {
      const { container, unmount } = render(node);
      expect(paints(container)).toEqual([]);
      unmount();
    }
  });
});
