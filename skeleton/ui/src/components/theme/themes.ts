// The three themes as data (Req 22.1, 22.2, 22.7; design D37.1, D37.2; Vigia design D25.1).
// Instrument is today's look, role by role; Field and Field night are the lead's new look. This and
// the other files of this folder, and `math/map/map-style.ts`, are the only places that hold a
// colour literal (Req 22.6).

import { MAP_DARK, MAP_FIX, MAP_LIGHT } from '../../math/map/map-style';
import type { ConstantRole, Role, ThemedRole } from './roles';

export type ThemeId = 'instrument' | 'field' | 'field-night';

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
  };
  readonly flags: {
    /** Whether an application draws its header illustration. */
    readonly illustrated: boolean;
    /** Whether it draws a shadow. */
    readonly elevated: boolean;
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

const FIELD_PRIMARY_GRADIENT = ['#FFD24D', '#FFB81F'] as const;

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
  },
  flags: { illustrated: false, elevated: false },
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
    shadow: '0 1px 2px rgba(14,30,51,.06), 0 4px 14px rgba(14,30,51,.08)',
  },
  flags: { illustrated: true, elevated: true },
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
  },
  flags: { illustrated: true, elevated: false },
};

export const THEMES: readonly Theme[] = [instrument, field, fieldNight];
