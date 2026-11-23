// `applyTheme` and `activeTheme` (Req 22.4, design D37.3, task 35.3): one function writes every role
// and every shape as a custom property of the root; a second call replaces; no style element.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from './roles';
import { field, fieldNight, instrument } from './themes';

type ApplyModule = typeof import('./apply-theme');

/** A fresh module, so that `activeTheme()` starts at Instrument each time. */
async function fresh(): Promise<ApplyModule> {
  vi.resetModules();
  return import('./apply-theme');
}

describe('applyTheme (Req 22.4)', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('div');
  });

  it('writes every role as --alidade-<role>', async () => {
    const { applyTheme } = await fresh();
    applyTheme(root, field);
    for (const role of ROLES) {
      expect(root.style.getPropertyValue(`--alidade-${role}`), role).toBe(field.colours[role]);
    }
  });

  it('writes the shapes: radii in pixels and the shadow, or none', async () => {
    const { applyTheme } = await fresh();
    applyTheme(root, field);
    expect(root.style.getPropertyValue('--alidade-card-radius')).toBe('16px');
    expect(root.style.getPropertyValue('--alidade-button-radius')).toBe('14px');
    expect(root.style.getPropertyValue('--alidade-badge-radius')).toBe('999px');
    expect(root.style.getPropertyValue('--alidade-image-radius')).toBe('16px');
    expect(root.style.getPropertyValue('--alidade-shadow')).toBe(field.shapes.shadow);
    applyTheme(root, fieldNight);
    expect(root.style.getPropertyValue('--alidade-shadow')).toBe('none');
    applyTheme(root, instrument);
    expect(root.style.getPropertyValue('--alidade-card-radius')).toBe('0px');
  });

  it('writes the gradients as fills, and the flat colour where a theme has none', async () => {
    const { applyTheme } = await fresh();
    applyTheme(root, field);
    expect(root.style.getPropertyValue('--alidade-primary-fill')).toBe(
      'linear-gradient(#FFD24D, #FFB81F)',
    );
    expect(root.style.getPropertyValue('--alidade-header-fill')).toBe(
      'linear-gradient(#12305A, #1B4372)',
    );
    applyTheme(root, instrument);
    expect(root.style.getPropertyValue('--alidade-primary-fill')).toBe(instrument.colours.primary);
    expect(root.style.getPropertyValue('--alidade-header-fill')).toBe(instrument.colours.header);
  });

  it('a second call replaces every value', async () => {
    const { applyTheme } = await fresh();
    applyTheme(root, field);
    applyTheme(root, fieldNight);
    for (const role of ROLES) {
      expect(root.style.getPropertyValue(`--alidade-${role}`), role).toBe(fieldNight.colours[role]);
    }
  });

  it('activeTheme() is Instrument until one is applied, then the last applied', async () => {
    const { applyTheme, activeTheme } = await fresh();
    // A fresh module graph holds its own Instrument object: compare the theme, not the object.
    expect(activeTheme().id).toBe('instrument');
    expect(activeTheme()).toEqual(instrument);
    applyTheme(root, field);
    expect(activeTheme()).toBe(field);
    applyTheme(root, fieldNight);
    expect(activeTheme()).toBe(fieldNight);
  });

  it('writes no style element and no text of style anywhere in the document', async () => {
    const { applyTheme } = await fresh();
    const before = document.querySelectorAll('style').length;
    applyTheme(document.documentElement, fieldNight);
    expect(document.querySelectorAll('style').length).toBe(before);
    expect(document.head.innerHTML).not.toContain('--alidade-');
    document.documentElement.removeAttribute('style');
  });
});
