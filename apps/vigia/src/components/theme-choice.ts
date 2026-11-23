// Vigia's theme (Req 22.3, design D25.8): Field by day, Field night when the phone is in dark mode,
// chosen at start and switched while the app is open. It takes `matchMedia` as an argument and reads
// no global (the entry passes the window's); it returns the function that stops the listening.

import {
  applyTheme,
  field,
  fieldNight,
  watchColourScheme,
  type MatchMedia,
  type ThemeRoot,
} from '@alidade/ui';

export function chooseTheme(root: ThemeRoot, matchMedia: MatchMedia): () => void {
  return watchColourScheme(matchMedia, (dark) => applyTheme(root, dark ? fieldNight : field));
}
