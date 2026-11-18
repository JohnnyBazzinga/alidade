// The surface that holds the image (the camera or the Scene image), the Reticle and the Mark
// (Req 10.4, 13.8, 17.10, 17.11, design D22). It reports taps and drags in CSS pixels and nothing
// else: the Session decides what they mean. While `frozen`, a pointer lifted is a Mark at the point
// where it lifted (one finger, no long press); otherwise, when `onAim` is given, a drag aims and
// the arrow keys aim in steps. A second finger is ignored.

import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  imageLayout,
  type ImageFit,
  type ImageLayout,
  type PixelPoint,
  type SourceSize,
} from '../math/image-layout';
import type { Mark } from '../math/session/session';
import { useElementSize, type ObserveElementSize } from './dom-size';
import { MarkRing } from './MarkRing';
import { Reticle } from './Reticle';
import { COLOURS } from './theme';

/** What the surface reports for aiming (simulator mode only). */
export type AimGesture =
  | { readonly kind: 'drag'; readonly dxPx: number; readonly dyPx: number }
  /** One arrow-key press: `+1` is right or up. The panel decides how big a step is. */
  | { readonly kind: 'key'; readonly azimuthSteps: -1 | 0 | 1; readonly altitudeSteps: -1 | 0 | 1 };

export interface ImageSurfaceProps {
  readonly frozen: boolean;
  readonly sourceSize: SourceSize | null;
  readonly fit: ImageFit;
  readonly mark: Mark | null;
  readonly onMark: (point: PixelPoint, layout: ImageLayout) => void;
  /** Present only in simulator mode. */
  readonly onAim?: (gesture: AimGesture) => void;
  readonly observe?: ObserveElementSize;
  /** Receives the layout whenever it is known, so that the parent can use the same one. */
  readonly onLayout?: (layout: ImageLayout | null) => void;
  readonly label?: string;
  /** The image, drawn under the Reticle; receives the layout when it is known. */
  readonly children: (layout: ImageLayout | null) => ReactNode;
}

interface Active {
  readonly pointerId: number;
  lastXPx: number;
  lastYPx: number;
}

const KEY_STEPS: Readonly<Record<string, readonly [-1 | 0 | 1, -1 | 0 | 1]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export function ImageSurface(props: ImageSurfaceProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const active = useRef<Active | null>(null);
  const size = useElementSize(ref, props.observe);
  const { sourceSize, fit, onLayout } = props;
  // Keyed on the numbers, not the objects: a parent that builds `sourceSize` inline would
  // otherwise make a new layout, and so a new `onLayout`, on every render.
  const sourceWidthSourcePx = sourceSize?.widthSourcePx;
  const sourceHeightSourcePx = sourceSize?.heightSourcePx;
  const layout = useMemo<ImageLayout | null>(() => {
    if (size === null || sourceWidthSourcePx === undefined || sourceHeightSourcePx === undefined)
      return null;
    const made = imageLayout(
      { widthSourcePx: sourceWidthSourcePx, heightSourcePx: sourceHeightSourcePx },
      size,
      fit,
    );
    return made.ok ? made.value : null;
  }, [size, sourceWidthSourcePx, sourceHeightSourcePx, fit]);
  useEffect(() => {
    onLayout?.(layout);
  }, [layout, onLayout]);

  const pointOf = (e: PointerEvent<HTMLDivElement>): PixelPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { xPx: e.clientX - rect.left, yPx: e.clientY - rect.top };
  };

  const down = (e: PointerEvent<HTMLDivElement>): void => {
    if (active.current !== null) return;
    active.current = { pointerId: e.pointerId ?? 0, lastXPx: e.clientX, lastYPx: e.clientY };
  };
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    const a = active.current;
    if (a === null || a.pointerId !== (e.pointerId ?? 0)) return;
    if (!props.frozen && props.onAim !== undefined) {
      props.onAim({ kind: 'drag', dxPx: e.clientX - a.lastXPx, dyPx: e.clientY - a.lastYPx });
    }
    a.lastXPx = e.clientX;
    a.lastYPx = e.clientY;
  };
  const up = (e: PointerEvent<HTMLDivElement>): void => {
    const a = active.current;
    if (a === null || a.pointerId !== (e.pointerId ?? 0)) return;
    active.current = null;
    if (props.frozen && layout !== null) props.onMark(pointOf(e), layout);
  };
  const cancel = (e: PointerEvent<HTMLDivElement>): void => {
    if (active.current?.pointerId === (e.pointerId ?? 0)) active.current = null;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    const steps = KEY_STEPS[e.key];
    if (steps === undefined || props.frozen || props.onAim === undefined) return;
    e.preventDefault();
    props.onAim({ kind: 'key', azimuthSteps: steps[0], altitudeSteps: steps[1] });
  };

  return (
    <div
      ref={ref}
      data-testid="image-surface"
      tabIndex={0}
      role="img"
      aria-label={props.label ?? 'Camera image'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onKeyDown={key}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: COLOURS.bg,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {props.children(layout)}
      <Reticle />
      {props.mark !== null && layout !== null && <MarkRing mark={props.mark} layout={layout} />}
    </div>
  );
}
