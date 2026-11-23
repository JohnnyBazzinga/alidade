// Which header the App draws (Req 22.2, design D25.4): full on the Smoke tab, compact on the other
// tabs and on the views opened from them, none on the docked Sight screen. The App chooses by
// route; a view whose header changes while it is shown (the question after a capture, the QR view)
// says so while it is mounted. A view that has a header with its title does not repeat the title.

import { createContext, useContext, useEffect } from 'react';

export type HeaderSpec =
  | { readonly variant: 'full' }
  | { readonly variant: 'compact'; readonly title: string }
  | { readonly variant: 'none' };

type SetHeader = (spec: HeaderSpec | null) => void;

const HeaderContext = createContext<SetHeader | null>(null);

export const HeaderProvider = HeaderContext.Provider;

/**
 * Sets the App's header while the calling view is shown (`null`: the route's own). Returns whether
 * an App draws the header, so that a view rendered alone (a test) still shows its own title.
 */
export function useHeader(spec: HeaderSpec | null): boolean {
  const set = useContext(HeaderContext);
  const key = spec === null ? '' : JSON.stringify(spec);
  useEffect(() => {
    if (set === null || key === '') return undefined;
    set(JSON.parse(key) as HeaderSpec);
    return () => set(null);
  }, [set, key]);
  return set !== null;
}
