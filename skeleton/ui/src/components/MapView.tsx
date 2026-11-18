// The map (Req 15, 13.6): a component over the Map adapter. It draws the observers, the Bearings
// with their Wedges and a Fix only as a Core `Fix` (which carries its ellipse); a failure of the
// adapter is shown through `messageFor`. The package's CSS for the map library is imported by the
// app, not here.

import type { Bearing, Fix } from '@alidade/core';
import { useEffect, useRef, useState } from 'react';
import { createMapAdapter, type MapAdapter } from '../adapters/map/map-adapter';
import type { MapLibreLike } from '../adapters/map/maplibre-types';
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
}

const FIT_PADDING_PX = 48;

export function MapView(props: MapViewProps) {
  const { lib, tiles, timer, observers, bearings, lineLengthM, fix } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const [adapter, setAdapter] = useState<MapAdapter | null>(null);
  const [failure, setFailure] = useState<UiFailure | null>(null);

  useEffect(() => {
    const element = container.current;
    if (lib === null || element === null) return undefined;
    const created = createMapAdapter(lib, element, tiles, timer);
    if (!created.ok) {
      setFailure(created);
      return undefined;
    }
    const stopErrors = created.value.onError(setFailure);
    setAdapter(created.value);
    return () => {
      stopErrors();
      created.value.destroy();
      setAdapter(null);
    };
  }, [lib, tiles, timer]);

  useEffect(() => {
    if (adapter === null) return;
    const results = [
      adapter.setObservers(observers),
      adapter.setBearings(bearings, lineLengthM),
      fix === null ? adapter.clearFix() : adapter.setFix(fix),
    ];
    const failed = results.find((r) => !r.ok);
    setFailure(failed !== undefined && !failed.ok ? failed : null);
    if (observers.length > 0) adapter.fitToFeatures(FIT_PADDING_PX);
  }, [adapter, observers, bearings, lineLengthM, fix]);

  return (
    <div data-testid="map-view">
      <div
        ref={container}
        data-testid="map-container"
        style={{
          width: '100%',
          height: 240,
          background: COLOURS.raised,
          marginBottom: SIZES.gapPx,
        }}
      />
      {failure !== null && <FailureNotice failure={failure} />}
    </div>
  );
}
