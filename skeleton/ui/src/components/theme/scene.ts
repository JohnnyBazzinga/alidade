// The colours of the Simulator's Scene image (Req 16.5, 22.6, design D37.5). The Scene image stands
// in for the camera's image: in Instrument, Field and Field night it is the same dark sky, as a
// camera's image does not change with a theme. Mira (Req 22.18, D37.14) draws it as its own
// landscape, a light sky over a green ground with the smoke as a plume, so that the simulator's
// lens looks like the lead's design. They are constants of the theme files (the only files that
// hold a colour literal), not roles, because no component other than the Scene image draws them.

export const SCENE_COLOURS = {
  /** The sky and the ground behind the horizon. */
  sky: '#26394A',
  /** The Sun's disc. */
  sun: '#F6E7A8',
  /** A Target's triangle and its label: today's light ink, which no theme changes here. */
  target: '#ECE8DC',
} as const;

/** Mira's landscape for the Scene image (Req 22.18): the sky's two ends, the ground's, the plume. */
export interface SceneLandscape {
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly groundTop: string;
  readonly groundBottom: string;
  readonly horizon: string;
  readonly sun: string;
  readonly sunGlow: string;
  readonly mark: string;
  readonly halo: string;
  readonly puffs: readonly [string, string, string];
  readonly flame: string;
}

export const MIRA_SCENE: SceneLandscape = {
  skyTop: '#BFD9E0',
  skyBottom: '#F1F4E8',
  groundTop: '#93B3A0',
  groundBottom: '#527E68',
  horizon: '#FFFFFF',
  sun: '#FFF8D6',
  sunGlow: '#FFF6C9',
  mark: '#0F1F1A',
  halo: '#FFFFFF',
  puffs: ['#9BA6A0', '#B6C0BA', '#CDD4CF'],
  flame: '#F2A03D',
};
