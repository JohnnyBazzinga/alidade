// The look of the screen (Req 13.1, 13.2, design §7.18, D17): an instrument's, not a dashboard's.
// Near-black slate surfaces, one brass accent, off-white tabular numerals in the system monospace
// stack, thin ruled lines. Styles are inline objects built from these constants, so that a test
// can read them (a simulated DOM does no layout, Req 13.12). No web font, no image, no network.

import {
  MIN_READOUT_FONT_PX,
  MIN_TOUCH_TARGET_PX,
  PRIMARY_CONTROL_HEIGHT_PX,
  SPACING_PX,
} from '../defaults';
import { MAP_DARK, MAP_FIX, MAP_LIGHT } from '../math/map/map-style';
import type { Rgb } from '../math/contrast';

export const COLOURS = {
  bg: '#0C0F12',
  panel: '#141A1F',
  raised: '#1D252C',
  ink: '#ECE8DC',
  inkDim: '#AEB6BD',
  brass: '#E3AE45',
  brassInk: '#14100A',
  alert: '#FF9B7A',
  outline: MAP_DARK,
  mapInk: MAP_LIGHT,
  rule: '#6A7884',
} as const;

/** The brass of the map's Fix is the theme's brass; `theme.test.tsx` checks the two copies. */
export const MAP_FIX_COLOUR = MAP_FIX;

export type ColourToken = keyof typeof COLOURS;

export const FONT_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const SIZES = {
  /** Numerals. */
  numeralPx: 32,
  /** Labels and units: at least `MIN_READOUT_FONT_PX` (Req 13.4). */
  labelPx: MIN_READOUT_FONT_PX,
  touchPx: MIN_TOUCH_TARGET_PX,
  primaryPx: PRIMARY_CONTROL_HEIGHT_PX,
  gapPx: SPACING_PX,
  /** The Reticle (Req 13.1): the core line, the dark outline on each side, the clear centre. */
  reticleCorePx: 2,
  reticleOutlinePx: 1,
  reticleGapPx: 8,
  reticleArmPx: 28,
  /** The Mark ring (Req 13.3). */
  markRingPx: 28,
  markRingCorePx: 2,
  markRingOutlinePx: 1,
} as const;

/** Parses `#RRGGBB`. */
export function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export interface PalettePair {
  readonly label: string;
  readonly foreground: string;
  readonly background: string;
}

const BLACK = '#000000';
const WHITE = '#FFFFFF';
const TEXT: readonly ColourToken[] = ['ink', 'inkDim', 'brass', 'alert'];
const SURFACES: readonly ColourToken[] = ['bg', 'panel', 'raised'];

/** Every pair of text or line colour and backing colour the screen uses (Req 13.2, 13.11). */
export const PALETTE_PAIRS: readonly PalettePair[] = [
  ...TEXT.flatMap((fg) =>
    SURFACES.map((bg) => ({
      label: `${fg} on ${bg}`,
      foreground: COLOURS[fg],
      background: COLOURS[bg],
    })),
  ),
  { label: 'brassInk on brass', foreground: COLOURS.brassInk, background: COLOURS.brass },
  { label: 'brass on black', foreground: COLOURS.brass, background: BLACK },
  { label: 'outline on white', foreground: COLOURS.outline, background: WHITE },
  { label: 'outline on brass', foreground: COLOURS.outline, background: COLOURS.brass },
  { label: 'mapInk on black', foreground: COLOURS.mapInk, background: BLACK },
  // The map's attribution (Req 15.2, task 31): `math/map/attribution-style.ts` uses this pair.
  {
    label: 'outline on mapInk (map attribution)',
    foreground: COLOURS.outline,
    background: COLOURS.mapInk,
  },
];

/** Hairlines carry no value; they are held to the 3:1 of non-text contrast (design §7.18). */
export const HAIRLINE_MIN_RATIO = 3;

export const NUMERAL_STYLE = {
  fontFamily: FONT_STACK,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
  fontStyle: 'normal',
} as const;
