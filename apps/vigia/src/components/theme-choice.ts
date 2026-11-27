// Vigia's theme (Req 22.3 as amended 2026-11-27, design D26): Mira, the lead's design of
// 2026-11-27, whatever the phone's colour scheme. Field and Field night stay themes of the skeleton,
// held at 7:1 by its tests; no app applies them now.

import { applyTheme, mira, type ThemeRoot } from '@alidade/ui';

export function chooseTheme(root: ThemeRoot): void {
  applyTheme(root, mira);
}
