// The pairs of a theme, as data (Req 22.3, 13.2, 13.11): every text pair at 7, every icon or
// outline that carries meaning at 3. A test holds each pair of each theme at its own threshold and
// fails for a role that is in no pair (the bright bars and `rule` are decorative, Req 22.3).

import type { Role } from './roles';
import type { Theme } from './themes';

/** WCAG AAA for text (Req 13.2). */
export const TEXT_MIN_RATIO = 7;
/** WCAG 1.4.11 for an icon or an outline that carries meaning (Req 22.3). */
export const ICON_MIN_RATIO = 3;

export type PairSide = Role | 'black' | 'white';

export interface ThemePair {
  readonly label: string;
  readonly foreground: string;
  readonly background: string;
  readonly minRatio: number;
  readonly foregroundRole?: PairSide;
  readonly backgroundRole?: PairSide;
}

const STATUSES = ['warn', 'danger', 'ok', 'info'] as const;
const SURFACES = ['bg', 'card', 'raised'] as const;

export function paletteFor(theme: Theme): readonly ThemePair[] {
  const c = theme.colours;
  const pairs: ThemePair[] = [];
  const add = (
    fg: Role,
    bg: Role,
    minRatio: number,
    label = `${fg} on ${bg}`,
    background: string = c[bg],
  ) =>
    pairs.push({
      label,
      foreground: c[fg],
      background,
      minRatio,
      foregroundRole: fg,
      backgroundRole: bg,
    });

  // Text on the surfaces and on every tint.
  const tints = ['warnTint', 'dangerTint', 'okTint', 'infoTint'] as const;
  for (const fg of ['ink', 'inkDim', 'accent'] as const) {
    for (const bg of [...SURFACES, ...tints]) add(fg, bg, TEXT_MIN_RATIO);
  }
  // Each status ink on its own tint and on the surfaces; each status icon at 3.
  for (const status of STATUSES) {
    const tint = `${status}Tint` as const;
    const ink = `${status}Ink` as const;
    const icon = `${status}Icon` as const;
    for (const bg of [tint, ...SURFACES]) {
      add(ink, bg, TEXT_MIN_RATIO);
      add(icon, bg, ICON_MIN_RATIO);
    }
  }
  // The primary control, and the ends of its gradient.
  add('primaryInk', 'primary', TEXT_MIN_RATIO);
  if (theme.gradients.primary !== null) {
    const [from, to] = theme.gradients.primary;
    add('primaryInk', 'primary', TEXT_MIN_RATIO, 'primaryInk on primary (gradient start)', from);
    add('primaryInk', 'primary', TEXT_MIN_RATIO, 'primaryInk on primary (gradient end)', to);
  }
  // The header, and the ends of its gradient.
  for (const fg of ['headerInk', 'headerDim'] as const) {
    add(fg, 'header', TEXT_MIN_RATIO);
    if (theme.gradients.header !== null) {
      const [from, to] = theme.gradients.header;
      add(fg, 'header', TEXT_MIN_RATIO, `${fg} on header (gradient start)`, from);
      add(fg, 'header', TEXT_MIN_RATIO, `${fg} on header (gradient end)`, to);
    }
  }
  // The tab bar.
  add('tabInk', 'tabBar', TEXT_MIN_RATIO);
  add('tabActive', 'tabBar', TEXT_MIN_RATIO);
  // An outline that carries meaning.
  for (const bg of SURFACES) add('ruleStrong', bg, ICON_MIN_RATIO);

  // The roles that no theme changes: the reticle on any image, the map's pairs, the QR.
  const side = (role: Role, background: PairSide, hex: string, label: string): ThemePair => ({
    label,
    foreground: c[role],
    background: hex,
    minRatio: TEXT_MIN_RATIO,
    foregroundRole: role,
    backgroundRole: background,
  });
  pairs.push(
    side('reticleCore', 'black', '#000000', 'reticleCore on black'),
    side('reticleOutline', 'white', '#FFFFFF', 'reticleOutline on white'),
    side('reticleOutline', 'reticleCore', c.reticleCore, 'reticleOutline on reticleCore'),
    side('mapInk', 'black', '#000000', 'mapInk on black'),
    side('mapOutline', 'mapInk', c.mapInk, 'mapOutline on mapInk (map attribution)'),
    side('qrDark', 'qrLight', c.qrLight, 'qrDark on qrLight'),
  );
  return pairs;
}
