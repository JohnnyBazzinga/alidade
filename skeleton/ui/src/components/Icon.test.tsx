// The UI's icons (Req 20.7, 22.8, design D37.6, task 35.4): a closed list of names drawn from
// lucide-react at 24 CSS pixels, stroke 2, currentColor, hidden from assistive technology.

import { render } from '@testing-library/react';
import * as lucide from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Icon, ICON_COMPONENT_NAMES, ICON_NAMES, type IconName } from './Icon';

/** The list of D37.6, typed here, name by name, with its lucide component. */
const D37_6: Readonly<Record<string, string>> = {
  smoke: 'Cloud',
  sightings: 'List',
  map: 'Map',
  siren: 'Siren',
  shield: 'ShieldAlert',
  binoculars: 'Binoculars',
  compass: 'Compass',
  crosshair: 'Crosshair',
  pin: 'MapPin',
  pins: 'MapPinned',
  info: 'Info',
  lightbulb: 'Lightbulb',
  warning: 'TriangleAlert',
  danger: 'OctagonAlert',
  success: 'CircleCheck',
  'chevron-left': 'ChevronLeft',
  'chevron-right': 'ChevronRight',
  'chevron-down': 'ChevronDown',
  'chevron-up': 'ChevronUp',
  camera: 'Camera',
  video: 'Video',
  hide: 'EyeOff',
  show: 'Eye',
  share: 'Share2',
  send: 'Send',
  trash: 'Trash2',
  clock: 'Clock',
  navigation: 'Navigation',
  vibrate: 'Vibrate',
  inbox: 'Inbox',
  qr: 'QrCode',
  link: 'Link',
  check: 'Check',
  steps: 'ListChecks',
  phone: 'Smartphone',
  copy: 'Copy',
};

describe('ICON_NAMES (D37.6)', () => {
  it('is the list of the design, name by name, with its lucide component', () => {
    expect([...ICON_NAMES]).toEqual(Object.keys(D37_6));
    expect(ICON_COMPONENT_NAMES).toEqual(D37_6);
  });

  it('every name exists in the installed package, so that a missing one is reported', () => {
    const exports = lucide as unknown as Record<string, unknown>;
    const missing = Object.values(D37_6).filter((component) => exports[component] === undefined);
    expect(missing).toEqual([]);
  });
});

describe('Icon (Req 22.8)', () => {
  it.each(ICON_NAMES.map((n) => [n]))(
    '%s: an svg of 24 by 24, stroke 2 in currentColor, aria-hidden',
    (name) => {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('width')).toBe('24');
      expect(svg?.getAttribute('height')).toBe('24');
      expect(svg?.getAttribute('stroke-width')).toBe('2');
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(svg?.getAttribute('focusable')).toBe('false');
      expect(svg?.getAttribute('data-icon')).toBe(name);
      // Decorative: no title, no label, no text of its own.
      expect(svg?.querySelector('title')).toBeNull();
      expect(svg?.getAttribute('aria-label')).toBeNull();
      expect(container.textContent).toBe('');
    },
  );

  it('does not shrink in a row of words', () => {
    const { container } = render(<Icon name="info" />);
    expect((container.querySelector('svg') as SVGElement).style.flexShrink).toBe('0');
  });

  it('refuses a name outside the list: at type level, and by drawing nothing', () => {
    // @ts-expect-error a name outside ICON_NAMES is a type error
    const outside: IconName = 'rocket';
    const { container } = render(<Icon name={outside} />);
    expect(container.innerHTML).toBe('');
  });
});
