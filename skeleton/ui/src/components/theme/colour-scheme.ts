// The phone's colour scheme (Req 22.5): `watchColourScheme` calls `onChange(true)` for dark and
// `onChange(false)` for light, from the current value and on every change, and returns the
// function that stops the listening. It takes `matchMedia` as an argument and reads no global.

export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: { readonly matches: boolean }) => void): void;
  removeEventListener(
    type: 'change',
    listener: (event: { readonly matches: boolean }) => void,
  ): void;
}

export type MatchMedia = (query: string) => MediaQueryListLike;

export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function watchColourScheme(
  matchMedia: MatchMedia,
  onChange: (dark: boolean) => void,
): () => void {
  const list = matchMedia(DARK_QUERY);
  const listener = (event: { readonly matches: boolean }): void => onChange(event.matches);
  list.addEventListener('change', listener);
  onChange(list.matches);
  return () => list.removeEventListener('change', listener);
}
