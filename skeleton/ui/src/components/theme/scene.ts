// The colours of the Simulator's Scene image (Req 16.5, 22.6, design D37.5). The Scene image stands
// in for the camera's image, so, like the camera's image, it is the same in every theme: a theme
// changes the screen around the image, never the image. They are constants of the theme files (the
// only files that hold a colour literal), not roles, because no component other than the Scene
// image draws them and no theme chooses them.

export const SCENE_COLOURS = {
  /** The sky and the ground behind the horizon. */
  sky: '#26394A',
  /** The Sun's disc. */
  sun: '#F6E7A8',
  /** A Target's triangle and its label: today's light ink, which no theme changes here. */
  target: '#ECE8DC',
} as const;
