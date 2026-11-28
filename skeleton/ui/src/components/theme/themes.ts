// The four themes as data (Req 22.1, 22.2, 22.7, 22.16; design D37.1, D37.2, D37.12; Vigia design
// D25.1, D26). Instrument is today's look, role by role; Field and Field night are the lead's look of
// 2026-11-22; Mira is the lead's design of 2026-11-27, which Vigia applies. This and
// the other files of this folder, and `math/map/map-style.ts`, are the only places that hold a
// colour literal (Req 22.6).

import {
  DEFAULT_MAP_PALETTE,
  MAP_DARK,
  MAP_FIX,
  MAP_LIGHT,
  MIRA_MAP_PALETTE,
  type MapPalette,
} from '../../math/map/map-style';
import type { ConstantRole, Role, ThemedRole } from './roles';
import { MIRA_SCENE, type SceneLandscape } from './scene';

export type ThemeId = 'instrument' | 'field' | 'field-night' | 'mira';

/** The system's sans and monospace: what every theme but Mira writes, as before. */
export const SYSTEM_SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const SYSTEM_MONO =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export interface Theme {
  readonly id: ThemeId;
  readonly colours: Readonly<Record<Role, string>>;
  /** `[from, to]`, or `null` when the theme draws a flat colour. Each end is a pair of the palette. */
  readonly gradients: {
    readonly primary: readonly [string, string] | null;
    readonly header: readonly [string, string] | null;
  };
  readonly shapes: {
    readonly cardRadiusPx: number;
    readonly buttonRadiusPx: number;
    readonly badgeRadiusPx: number;
    readonly imageRadiusPx: number;
    /** A CSS `box-shadow`, or `null`. */
    readonly shadow: string | null;
    /** A tile: a disclosure's summary, a row that opens a view, a status card (Req 22.16). */
    readonly tileRadiusPx: number;
    /** The primary control's own shadow (Mira lifts the primary and nothing else). */
    readonly primaryShadow: string | null;
    /** A secondary control's edge, in CSS px, and its fill: a role, or none (an outline). */
    readonly controlEdgePx: number;
    readonly controlFill: Role | 'none';
  };
  /**
   * The three font stacks (Req 22.16): prose and controls, readings and codes, display numerals and
   * titles. A theme with a web font names it first; the fonts are the application's files, served
   * from its own host (Vigia Req 15), and the system's stacks follow.
   */
  readonly fonts: {
    readonly body: string;
    readonly numeric: string;
    readonly display: string;
    /** The weight of a primary control's words, and of a secondary control's. */
    readonly primaryWeight: number;
    readonly controlWeight: number;
  };
  /** The map's paints (Req 22.16): the defaults, or Mira's yellow. */
  readonly map: MapPalette;
  /** The Scene image as a landscape (Req 22.18), or `null` for the dark sky of D37.5. */
  readonly scene: SceneLandscape | null;
  readonly flags: {
    /** Whether an application draws its header illustration. */
    readonly illustrated: boolean;
    /** Whether it draws a shadow. */
    readonly elevated: boolean;
    /**
     * Whether a status is drawn as a card: the tone's tint, a bar of 4, the tone's icon, a bold
     * headline and the instruction at 16 (Req 22.13). Instrument draws today's block instead.
     */
    readonly cards: boolean;
    /**
     * Mira's sighting screen (Req 22.17): the camera as a round lens in a ring of compass ticks, the
     * angle as one large numeral with a line of small capitals under it, Details and "Other ways to
     * set north" as two tiles, the north prompt among the content, and Back as a round control.
     */
    readonly dial: boolean;
  };
}

/** The six roles that every theme has the same: the reticle, the map and the QR decide them. */
const CONSTANTS: Readonly<Record<ConstantRole, string>> = {
  reticleCore: MAP_FIX,
  reticleOutline: MAP_DARK,
  mapInk: MAP_LIGHT,
  mapOutline: MAP_DARK,
  qrDark: '#000000',
  qrLight: '#FFFFFF',
};

const instrumentThemed: Readonly<Record<ThemedRole, string>> = {
  bg: '#0C0F12',
  card: '#141A1F',
  raised: '#1D252C',
  ink: '#ECE8DC',
  inkDim: '#AEB6BD',
  accent: '#E3AE45',
  primary: '#E3AE45',
  primaryInk: '#14100A',
  header: '#0C0F12',
  headerInk: '#ECE8DC',
  headerDim: '#AEB6BD',
  tabBar: '#141A1F',
  tabInk: '#ECE8DC',
  tabActive: '#E3AE45',
  warnTint: '#141A1F',
  warnInk: '#FF9B7A',
  warnIcon: '#FF9B7A',
  warnBar: '#FF9B7A',
  dangerTint: '#141A1F',
  dangerInk: '#FF9B7A',
  dangerIcon: '#FF9B7A',
  dangerBar: '#FF9B7A',
  okTint: '#141A1F',
  okInk: '#9ED9A8',
  okIcon: '#9ED9A8',
  okBar: '#9ED9A8',
  infoTint: '#141A1F',
  infoInk: '#ECE8DC',
  infoIcon: '#E3AE45',
  infoBar: '#E3AE45',
  rule: '#6A7884',
  ruleStrong: '#6A7884',
};

const fieldThemed: Readonly<Record<ThemedRole, string>> = {
  bg: '#F3F6FA',
  card: '#FFFFFF',
  raised: '#EAF0F7',
  ink: '#0E1E33',
  inkDim: '#3B4859',
  accent: '#1A4D8F',
  primary: '#FFC233',
  primaryInk: '#1A1300',
  header: '#12305A',
  headerInk: '#FFFFFF',
  headerDim: '#D3E0F0',
  tabBar: '#0F2747',
  tabInk: '#E8EEF6',
  tabActive: '#FFC233',
  warnTint: '#FFF1DA',
  warnInk: '#6E3500',
  warnIcon: '#B45309',
  warnBar: '#F59E0B',
  dangerTint: '#FDEBEB',
  dangerInk: '#8A1A1A',
  dangerIcon: '#C62828',
  dangerBar: '#E53935',
  okTint: '#E2F3E6',
  okInk: '#1A5530',
  okIcon: '#2E7D32',
  okBar: '#2E9E5B',
  infoTint: '#E7F0FB',
  infoInk: '#1A4D8F',
  infoIcon: '#1A4D8F',
  infoBar: '#3B82F6',
  rule: '#D3DCE8',
  ruleStrong: '#74849A',
};

const nightThemed: Readonly<Record<ThemedRole, string>> = {
  bg: '#0B1320',
  card: '#131D2C',
  raised: '#1B283A',
  ink: '#EAF0F7',
  inkDim: '#AEBBCC',
  accent: '#93BBF3',
  primary: '#FFC233',
  primaryInk: '#1A1300',
  header: '#0E2240',
  headerInk: '#FFFFFF',
  headerDim: '#C9D7EA',
  tabBar: '#08111E',
  tabInk: '#E3EAF3',
  tabActive: '#FFC233',
  warnTint: '#2A1F0E',
  warnInk: '#FFC27A',
  warnIcon: '#FFB454',
  warnBar: '#F59E0B',
  dangerTint: '#2C1517',
  dangerInk: '#FFA8A8',
  dangerIcon: '#FF8A8A',
  dangerBar: '#E53935',
  okTint: '#0F2618',
  okInk: '#8EDBA6',
  okIcon: '#5FCF84',
  okBar: '#2E9E5B',
  infoTint: '#122440',
  infoInk: '#A7C7F6',
  infoIcon: '#93BBF3',
  infoBar: '#3B82F6',
  rule: '#26354A',
  ruleStrong: '#6F8299',
};

// Mira (the lead's design, 2026-11-27): an off-white page, a deep green-black ink, one yellow.
// Its values are the design's, except where a pair of the palette needed 7 : 1 (Req 22.3): the
// success tint is lighter (#E5F5EA for #DDF1E4); the bars are the tints, as Mira draws none.
const miraThemed: Readonly<Record<ThemedRole, string>> = {
  bg: '#FAFBF8',
  card: '#FFFFFF',
  raised: '#EEF2EC',
  ink: '#0F1F1A',
  inkDim: '#45544E',
  accent: '#0F1F1A',
  primary: '#FFD400',
  primaryInk: '#0F1F1A',
  header: '#FAFBF8',
  headerInk: '#0F1F1A',
  headerDim: '#45544E',
  tabBar: '#0F1F1A',
  tabInk: '#C4CFC9',
  tabActive: '#FFD400',
  warnTint: '#FFF4BF',
  warnInk: '#3D3300',
  warnIcon: '#0F1F1A',
  warnBar: '#FFF4BF',
  dangerTint: '#FDEDE8',
  dangerInk: '#7A1A06',
  dangerIcon: '#B3261E',
  dangerBar: '#FDEDE8',
  okTint: '#E5F5EA',
  okInk: '#17553A',
  okIcon: '#1F6B45',
  okBar: '#E5F5EA',
  infoTint: '#EEF2EC',
  infoInk: '#26352F',
  infoIcon: '#45544E',
  infoBar: '#EEF2EC',
  rule: '#DDE3DB',
  ruleStrong: '#0F1F1A',
};

const FIELD_PRIMARY_GRADIENT = ['#FFD24D', '#FFB81F'] as const;
const FIELD_SHADOW = '0 1px 2px rgba(14,30,51,.06), 0 4px 14px rgba(14,30,51,.08)';

const SYSTEM_FONTS = {
  body: SYSTEM_SANS,
  numeric: SYSTEM_MONO,
  display: SYSTEM_SANS,
  primaryWeight: 400,
  controlWeight: 400,
} as const;

export const instrument: Theme = {
  id: 'instrument',
  colours: { ...instrumentThemed, ...CONSTANTS },
  gradients: { primary: null, header: null },
  shapes: {
    cardRadiusPx: 0,
    buttonRadiusPx: 0,
    badgeRadiusPx: 0,
    imageRadiusPx: 0,
    shadow: null,
    tileRadiusPx: 0,
    primaryShadow: null,
    controlEdgePx: 1,
    controlFill: 'raised',
  },
  fonts: SYSTEM_FONTS,
  map: DEFAULT_MAP_PALETTE,
  scene: null,
  flags: { illustrated: false, elevated: false, cards: false, dial: false },
};

export const field: Theme = {
  id: 'field',
  colours: { ...fieldThemed, ...CONSTANTS },
  gradients: { primary: FIELD_PRIMARY_GRADIENT, header: ['#12305A', '#1B4372'] },
  shapes: {
    cardRadiusPx: 16,
    buttonRadiusPx: 14,
    badgeRadiusPx: 999,
    imageRadiusPx: 16,
    shadow: FIELD_SHADOW,
    tileRadiusPx: 14,
    primaryShadow: FIELD_SHADOW,
    controlEdgePx: 1,
    controlFill: 'raised',
  },
  fonts: SYSTEM_FONTS,
  map: DEFAULT_MAP_PALETTE,
  scene: null,
  flags: { illustrated: true, elevated: true, cards: true, dial: false },
};

export const fieldNight: Theme = {
  id: 'field-night',
  colours: { ...nightThemed, ...CONSTANTS },
  gradients: { primary: FIELD_PRIMARY_GRADIENT, header: ['#0E2240', '#173A66'] },
  shapes: {
    cardRadiusPx: 16,
    buttonRadiusPx: 14,
    badgeRadiusPx: 999,
    imageRadiusPx: 16,
    shadow: null,
    tileRadiusPx: 14,
    primaryShadow: null,
    controlEdgePx: 1,
    controlFill: 'raised',
  },
  fonts: SYSTEM_FONTS,
  map: DEFAULT_MAP_PALETTE,
  scene: null,
  flags: { illustrated: true, elevated: false, cards: true, dial: false },
};

/** Mira's fonts: Sora (variable, 100 to 800) and IBM Plex Mono 500, both under the SIL OFL 1.1. */
export const MIRA_SANS = `"Sora Variable", Sora, ${SYSTEM_SANS}`;
export const MIRA_MONO = `"IBM Plex Mono", ${SYSTEM_MONO}`;

export const mira: Theme = {
  id: 'mira',
  colours: { ...miraThemed, ...CONSTANTS },
  gradients: { primary: null, header: null },
  shapes: {
    cardRadiusPx: 24,
    buttonRadiusPx: 999,
    badgeRadiusPx: 999,
    imageRadiusPx: 999,
    shadow: null,
    tileRadiusPx: 16,
    primaryShadow: '0 10px 22px rgba(15,31,26,0.14)',
    controlEdgePx: 1.5,
    controlFill: 'none',
  },
  fonts: {
    body: MIRA_SANS,
    numeric: MIRA_MONO,
    display: MIRA_SANS,
    primaryWeight: 800,
    controlWeight: 600,
  },
  map: MIRA_MAP_PALETTE,
  scene: MIRA_SCENE,
  flags: { illustrated: false, elevated: false, cards: true, dial: true },
};

export const THEMES: readonly Theme[] = [instrument, field, fieldNight, mira];
