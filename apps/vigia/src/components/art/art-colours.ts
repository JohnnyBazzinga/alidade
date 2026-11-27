// The art's own constants (design D25.4, D26.4): the colours of Mira's schematic, a landscape in
// soft greens with a grey plume of smoke, the same in every theme, as the smoke in a photograph is.
// They are the only colours of the app outside the theme's roles (Vigia's literal scan allows this
// file alone among the components). No text is drawn on them except on the white label of the
// schematic and in ink on its sky (Req 22.12), at 7 : 1 or more.
export const ART_COLOURS = {
  /** The plume's light puffs and its dark core (Field's header and idle scene). */
  plumeLight: '#D9DEE5',
  plumeDark: '#9AA4B2',
  /** Mira's schematic: the sky, the sun, the far hill, the two bands of ground, the trees. */
  sky: '#E6F1EF',
  sun: '#FFF3B8',
  hill: '#B9D0BF',
  groundFar: '#D7E7D2',
  groundNear: '#C6DCC3',
  trees: '#7FA08E',
  /** Its plume, from the base up, and the flame. */
  puff1: '#9BA6A0',
  puff2: '#B6C0BA',
  puff3: '#CDD4CF',
  puff4: '#D5DBD7',
  puff5: '#E3E8E4',
  flame: '#F2A03D',
  flameCore: '#FFD166',
  /** The words "Line of sight" along the line. */
  lineWords: '#26352F',
} as const;
