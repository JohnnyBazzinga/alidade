// Applying a theme (Req 22.4, design D37.3): one function writes every role and every shape as a
// custom property of the root element; a component writes `var(--alidade-<role>)` in its inline
// style, so that a switch of theme changes every component at once with no re-render. A part that
// needs a resolved value (a canvas, a library's style) reads `activeTheme()` and is told by
// `onThemeChange` when another theme is applied. No `<style>` element or text is ever written.

import { useSyncExternalStore } from 'react';
import { CSS_VAR_PREFIX, ROLES } from './roles';
import { instrument, type Theme } from './themes';

/** What `applyTheme` needs of the root: the CSSOM's `setProperty`. */
export interface ThemeRoot {
  readonly style: { setProperty(name: string, value: string): void };
}

let active: Theme = instrument;
const subscribers = new Set<(theme: Theme) => void>();

const px = (n: number): string => `${n}px`;

/** A gradient as a CSS fill, or the flat colour where the theme has none. */
function fillOf(gradient: readonly [string, string] | null, flat: string): string {
  return gradient === null ? flat : `linear-gradient(${gradient[0]}, ${gradient[1]})`;
}

export function applyTheme(root: ThemeRoot, theme: Theme): void {
  const set = (name: string, value: string) =>
    root.style.setProperty(`${CSS_VAR_PREFIX}${name}`, value);
  for (const role of ROLES) set(role, theme.colours[role]);
  set('card-radius', px(theme.shapes.cardRadiusPx));
  set('button-radius', px(theme.shapes.buttonRadiusPx));
  set('badge-radius', px(theme.shapes.badgeRadiusPx));
  set('image-radius', px(theme.shapes.imageRadiusPx));
  set('shadow', theme.shapes.shadow ?? 'none');
  set('primary-fill', fillOf(theme.gradients.primary, theme.colours.primary));
  set('header-fill', fillOf(theme.gradients.header, theme.colours.header));
  active = theme;
  for (const notify of [...subscribers]) notify(theme);
}

/** The theme last applied; Instrument until an application applies one. */
export function activeTheme(): Theme {
  return active;
}

/** Calls `listener` with the theme on every `applyTheme`; returns the function that stops it. */
export function onThemeChange(listener: (theme: Theme) => void): () => void {
  subscribers.add(listener);
  return () => void subscribers.delete(listener);
}

/** The active theme, for a part that needs resolved values; it is drawn again on a change. */
export function useActiveTheme(): Theme {
  return useSyncExternalStore((notify) => onThemeChange(notify), activeTheme, activeTheme);
}
