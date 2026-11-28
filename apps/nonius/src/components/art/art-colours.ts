// The art's own constants (Nonius Req 16.2): the colours of Mira's Sun dial and of the 20° drawing,
// as the author's design draws them, the same in every theme. They are the only colours of the app
// outside the theme's roles (the look test allows this file's alone). No text is drawn on them.
export const ART_COLOURS = {
  /** The dial's thin ticks, every 5°. */
  tick: '#9AA8A1',
  /** The Sun's rays around the button, and the edge of the earlier Sun in the 20° drawing. */
  ray: '#F2C230',
  /** The earlier Sun of the 20° drawing, paler than the later one. */
  sunEarlier: '#FFE066',
} as const;
