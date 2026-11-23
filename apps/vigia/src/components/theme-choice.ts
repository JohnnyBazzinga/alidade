// Vigia's theme (Req 22.3 as amended 2026-11-23, design D25.8): Field, whatever the phone's colour
// scheme. The lead chose the light look of his references on his iPhone, whose dark mode had shown
// Field night. Field night stays a theme of the skeleton, held at 7:1 by its tests; no app applies it.

import { applyTheme, field, type ThemeRoot } from '@alidade/ui';

export function chooseTheme(root: ThemeRoot): void {
  applyTheme(root, field);
}
