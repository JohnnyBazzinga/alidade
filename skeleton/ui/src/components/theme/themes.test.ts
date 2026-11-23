// The three themes as data (Req 22.1, 22.2, 22.7; design D37.1, D37.2, Vigia D25.1). Every value
// below is typed here, not read from the themes, so that a change of a colour fails a test.

import { describe, expect, it } from 'vitest';
import { CONSTANT_ROLES, ROLES, THEMED_ROLES, type Role } from './roles';
import { field, fieldNight, instrument, THEMES } from './themes';

/** Vigia design D25.1, Field. */
const FIELD: Readonly<Record<(typeof THEMED_ROLES)[number], string>> = {
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

/** Vigia design D25.1, Field night. */
const NIGHT: Readonly<Record<(typeof THEMED_ROLES)[number], string>> = {
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

/** Design D37.2: today's look, role by role. */
const INSTRUMENT: Readonly<Record<(typeof THEMED_ROLES)[number], string>> = {
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

/** The roles that no theme changes (Req 22.2). */
const CONSTANTS: Readonly<Record<(typeof CONSTANT_ROLES)[number], string>> = {
  reticleCore: '#E3AE45',
  reticleOutline: '#0A0C0E',
  mapInk: '#F2EEE3',
  mapOutline: '#0A0C0E',
  qrDark: '#000000',
  qrLight: '#FFFFFF',
};

const HEX = /^#[0-9A-F]{6}$/;

describe('the roles (Req 22.2)', () => {
  it('are the thirty-two of the themes and the six that no theme changes, with no repeat', () => {
    expect(THEMED_ROLES).toHaveLength(32);
    expect(CONSTANT_ROLES).toEqual([
      'reticleCore',
      'reticleOutline',
      'mapInk',
      'mapOutline',
      'qrDark',
      'qrLight',
    ]);
    expect(ROLES).toHaveLength(38);
    expect(new Set(ROLES).size).toBe(38);
    expect([...THEMED_ROLES].sort()).toEqual(Object.keys(FIELD).sort());
  });
});

describe('the three themes (Req 22.1)', () => {
  it('are Instrument, Field and Field night', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['instrument', 'field', 'field-night']);
    expect(instrument.id).toBe('instrument');
    expect(field.id).toBe('field');
    expect(fieldNight.id).toBe('field-night');
  });

  it.each([
    ['instrument', instrument],
    ['field', field],
    ['field-night', fieldNight],
  ] as const)('%s has every role, none extra, each an upper-case #RRGGBB', (_id, theme) => {
    expect(Object.keys(theme.colours).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) expect(theme.colours[role as Role], role).toMatch(HEX);
  });

  it('Field has the values of Vigia design D25.1', () => {
    for (const role of THEMED_ROLES) expect(field.colours[role], role).toBe(FIELD[role]);
  });

  it('Field night has the values of Vigia design D25.1', () => {
    for (const role of THEMED_ROLES) expect(fieldNight.colours[role], role).toBe(NIGHT[role]);
  });

  it('Instrument has today’s values, including okInk #9ED9A8 (Req 22.2)', () => {
    for (const role of THEMED_ROLES) expect(instrument.colours[role], role).toBe(INSTRUMENT[role]);
    expect(instrument.colours.okInk).toBe('#9ED9A8');
  });

  it('the six roles that no theme changes are the same in the three themes', () => {
    for (const theme of THEMES) {
      for (const role of CONSTANT_ROLES) expect(theme.colours[role], role).toBe(CONSTANTS[role]);
    }
  });

  it('Instrument’s four tints are its panel and its bright bars are today’s alert or its own icon colour', () => {
    const c = instrument.colours;
    for (const tint of [c.warnTint, c.dangerTint, c.okTint, c.infoTint]) expect(tint).toBe(c.card);
    expect(c.warnInk).toBe('#FF9B7A');
    expect(c.dangerInk).toBe('#FF9B7A');
    expect(c.warnBar).toBe('#FF9B7A');
  });
});

describe('the shapes, the gradients and the flags (Req 22.7, Vigia 22.4)', () => {
  it('Field and Field night: radii 16, 14, 999, 16; Field has its shadow, night none', () => {
    for (const theme of [field, fieldNight]) {
      expect(theme.shapes.cardRadiusPx).toBe(16);
      expect(theme.shapes.buttonRadiusPx).toBe(14);
      expect(theme.shapes.badgeRadiusPx).toBe(999);
      expect(theme.shapes.imageRadiusPx).toBe(16);
      expect(theme.flags.illustrated).toBe(true);
    }
    expect(field.shapes.shadow).toBe(
      '0 1px 2px rgba(14,30,51,.06), 0 4px 14px rgba(14,30,51,.08)',
    );
    expect(field.flags.elevated).toBe(true);
    expect(fieldNight.shapes.shadow).toBeNull();
    expect(fieldNight.flags.elevated).toBe(false);
  });

  it('Instrument: radii 0, no shadow, no illustration, no elevation, no gradient', () => {
    expect(instrument.shapes).toEqual({
      cardRadiusPx: 0,
      buttonRadiusPx: 0,
      badgeRadiusPx: 0,
      imageRadiusPx: 0,
      shadow: null,
    });
    expect(instrument.flags).toEqual({ illustrated: false, elevated: false });
    expect(instrument.gradients).toEqual({ primary: null, header: null });
  });

  it('the gradients of Field and Field night', () => {
    expect(field.gradients.primary).toEqual(['#FFD24D', '#FFB81F']);
    expect(field.gradients.header).toEqual(['#12305A', '#1B4372']);
    expect(fieldNight.gradients.primary).toEqual(['#FFD24D', '#FFB81F']);
    expect(fieldNight.gradients.header).toEqual(['#0E2240', '#173A66']);
  });
});
