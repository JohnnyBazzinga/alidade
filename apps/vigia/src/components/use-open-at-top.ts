// Every view opens with its scroll at the top (Req 10.12): the first thing on it is the first
// thing to read. The scrolling part is the App's `main`; a view that is not a route of its own (the
// QR view, a question, a confirmation) calls this with a key that changes when the view changes.

import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useOpenAtTop<T extends HTMLElement>(key: string): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>('[data-testid="app-main"]');
    if (scroller !== null && scroller !== undefined) scroller.scrollTop = 0;
  }, [key]);
  return ref;
}
