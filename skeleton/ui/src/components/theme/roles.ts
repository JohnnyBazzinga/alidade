// The roles of a theme (Req 22.2, design D37.1). A component writes a role, never a colour.

/** The roles that a theme chooses. */
export const THEMED_ROLES = [
  'bg',
  'card',
  'raised',
  'ink',
  'inkDim',
  'accent',
  'primary',
  'primaryInk',
  'header',
  'headerInk',
  'headerDim',
  'tabBar',
  'tabInk',
  'tabActive',
  'warnTint',
  'warnInk',
  'warnIcon',
  'warnBar',
  'dangerTint',
  'dangerInk',
  'dangerIcon',
  'dangerBar',
  'okTint',
  'okInk',
  'okIcon',
  'okBar',
  'infoTint',
  'infoInk',
  'infoIcon',
  'infoBar',
  'rule',
  'ruleStrong',
] as const;

/** The roles that no theme changes, because the image, the map or the QR standard decides them. */
export const CONSTANT_ROLES = [
  'reticleCore',
  'reticleOutline',
  'mapInk',
  'mapOutline',
  'qrDark',
  'qrLight',
] as const;

export const ROLES = [...THEMED_ROLES, ...CONSTANT_ROLES] as const;

export type ThemedRole = (typeof THEMED_ROLES)[number];
export type ConstantRole = (typeof CONSTANT_ROLES)[number];
export type Role = (typeof ROLES)[number];

/** The prefix of the custom properties that `applyTheme` writes (Req 22.4). */
export const CSS_VAR_PREFIX = '--alidade-';

/** `var(--alidade-<role>)`: what a component writes in an inline style. */
export function roleVar(role: Role): string {
  return `var(${CSS_VAR_PREFIX}${role})`;
}
