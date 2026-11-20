// The map (Req 15, 13.6): a component over the Map adapter. It draws the observers, the Bearings
// with their Wedges and a Fix only as a Core `Fix` (which carries its ellipse); a failure of the
// adapter is shown through `messageFor`. The package's CSS for the map library is imported by the
// app, not here.

import type { Bearing, Fix } from '@alidade/core';
import { useEffect, useRef, useState } from 'react';
import { createMapAdapter, type MapAdapter } from '../adapters/map/map-adapter';
import type { MapLibreLike } from '../adapters/map/maplibre-types';
import type { AppLayer } from '../math/map/app-layer';
import type { MapObserver } from '../math/map/observer-features';
import type { TileSource } from '../math/map/map-style';
import type { UiFailure } from '../result';
import { FailureNotice } from './FailureNotice';
import type { Timer } from './timer';
import { COLOURS, SIZES } from './theme';

export interface MapViewProps {
  /** `null` while the library loads. */
  readonly lib: MapLibreLike | null;
  readonly tiles: TileSource | null;
  readonly timer: Timer;
  readonly observers: readonly MapObserver[];
  readonly bearings: readonly Bearing[];
  readonly lineLengthM: number;
  /** A Core Fix with its covariance and Ellipse; there is no way to draw a Position alone. */
  readonly fix: Fix | null;
  /**
   * Layers of the application's own, drawn under the skeleton's (Req 15.14 to 15.16). Stable
   * between renders, like the other props. A layer that was here and no longer is, is removed. The
   * map is fitted to the observers, and also to each layer that says `fit: true`.
   */
  readonly layers?: readonly AppLayer[];
  /**
   * The height of the map, as a CSS length (240 CSS px by default). An app whose map is the
   * screen's main content gives it more, so that a small 95 % ellipse can be read (design D34).
   */
  readonly height?: string | number;
}

const NO_LAYERS: readonly AppLayer[] = [];

const FIT_PADDING_PX = 48;

export function MapView(props: MapViewProps) {
  const { lib, tiles, timer, observers, bearings, lineLengthM, fix } = props;
  const layers = props.layers ?? NO_LAYERS;
  // The ids of the layers the adapter holds because this component set them.
  const heldLayers = useRef<ReadonlySet<string>>(new Set());
  const container = useRef<HTMLDivElement | null>(null);
  const [adapter, setAdapter] = useState<MapAdapter | null>(null);
  const [failure, setFailure] = useState<UiFailure | null>(null);
  // Req 15.18: a map that cannot draw on this device stays said, whatever data arrives afterwards.
  const [unavailable, setUnavailable] = useState<UiFailure | null>(null);

  useEffect(() => {
    const element = container.current;
    if (lib === null || element === null) return undefined;
    const created = createMapAdapter(lib, element, tiles, timer);
    if (!created.ok) {
      setFailure(created);
      return undefined;
    }
    const stopErrors = created.value.onError((f) =>
      f.reason === 'map_unavailable' ? setUnavailable(f) : setFailure(f),
    );
    setAdapter(created.value);
    return () => {
      stopErrors();
      created.value.destroy();
      heldLayers.current = new Set();
      setAdapter(null);
      setUnavailable(null);
    };
  }, [lib, tiles, timer]);

  useEffect(() => {
    if (adapter === null) return;
    const results = [
      adapter.setObservers(observers),
      adapter.setBearings(bearings, lineLengthM),
      fix === null ? adapter.clearFix() : adapter.setFix(fix),
    ];
    // A layer is held if the adapter took it now, or took it before and refused the change.
    const held = new Set<string>();
    for (const layer of layers) {
      const result = adapter.setLayer(layer.id, layer.collection, layer.paint);
      results.push(result);
      if (result.ok || heldLayers.current.has(layer.id)) held.add(layer.id);
    }
    for (const id of heldLayers.current) {
      if (!layers.some((l) => l.id === id)) results.push(adapter.clearLayer(id));
    }
    heldLayers.current = held;
    const fitted = layers.filter((l) => l.fit === true && held.has(l.id)).map((l) => l.collection);
    // The fit's result is shown like any other (task group 30.1): an extent over 180° of
    // longitude is `crosses_antimeridian`, and the user must be told the map is not fitted.
    if (observers.length > 0 || fitted.length > 0) {
      results.push(adapter.fitToFeatures(FIT_PADDING_PX, fitted));
    }
    const failed = results.find((r) => !r.ok);
    setFailure(failed !== undefined && !failed.ok ? failed : null);
  }, [adapter, observers, bearings, lineLengthM, fix, layers]);

  const shown = unavailable ?? failure;
  return (
    <div data-testid="map-view">
      <div
        ref={container}
        data-testid="map-container"
        style={{
          width: '100%',
          height: props.height ?? 240,
          background: COLOURS.raised,
          marginBottom: SIZES.gapPx,
        }}
      />
      {shown !== null && <FailureNotice failure={shown} />}
    </div>
  );
}
