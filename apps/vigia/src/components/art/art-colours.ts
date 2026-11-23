// The art's own constants (design D25.4): the greys of the plume of smoke, the same in every theme,
// as the smoke in a photograph is. They are the only colours of the app outside the theme's roles
// (Vigia's literal scan allows this file alone among the components).

export const ART_COLOURS = {
  /** The plume's light puffs. */
  plumeLight: '#D9DEE5',
  /** The plume's dark core. */
  plumeDark: '#9AA4B2',
} as const;
