// The one module that touches `ResizeObserver` (design D22). A simulated DOM has none, so a
// component receives `observe` as a prop and tests inject their own.

import { useEffect, useState, type RefObject } from 'react';
import type { PixelSize } from '../math/image-layout';

/** Calls `listener` with the element's size now and whenever it changes; returns a stop function. */
export type ObserveElementSize = (
  element: Element,
  listener: (size: PixelSize) => void,
) => () => void;

export const observeElementSize: ObserveElementSize = (element, listener) => {
  if (typeof ResizeObserver === 'undefined') {
    const rect = element.getBoundingClientRect();
    listener({ widthPx: rect.width, heightPx: rect.height });
    return () => undefined;
  }
  const observer = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry !== undefined) {
      listener({ widthPx: entry.contentRect.width, heightPx: entry.contentRect.height });
    }
  });
  observer.observe(element);
  return () => observer.disconnect();
};

/** The element's size in CSS pixels, or `null` until it is known or while it is empty. */
export function useElementSize(
  ref: RefObject<Element | null>,
  observe: ObserveElementSize = observeElementSize,
): PixelSize | null {
  const [size, setSize] = useState<PixelSize | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    return observe(element, (next) => {
      const usable =
        Number.isFinite(next.widthPx) &&
        Number.isFinite(next.heightPx) &&
        next.widthPx > 0 &&
        next.heightPx > 0;
      setSize((prev) => {
        if (!usable) return null;
        return prev !== null && prev.widthPx === next.widthPx && prev.heightPx === next.heightPx
          ? prev
          : next;
      });
    });
  }, [ref, observe]);
  return size;
}
