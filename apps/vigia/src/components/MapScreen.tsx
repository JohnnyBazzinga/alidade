// The Map screen (design §9, §7.18; Req 6.1, 6.11, 18.1 to 18.7): UI's MapView with the used
// observers, their lines and Wedges, the Fix drawn with its 95 % ellipse by UI's `setFix` alone,
// and the set-aside Sightings in grey dashes through the general layers. Then the legend, which
// names every drawing, and the Overlays panel when the Overlays module is present. This screen
// knows nothing of the Overlays but the slot it is given (Req 1.10): the App builds it.

import {
  bearingFeatures,
  mapBounds,
  MapView,
  observerFeatures,
  WEDGE_ARC_STEP_RAD,
  type AppLayer,
  type MapLibreLike,
  type UiFailure,
} from '@alidade/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { mapModel } from '../math/fix/map-model';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useVigia } from './store';

/**
 * What the Overlays add to this screen: their layers, their entries of the legend (each drawing
 * with its Source and time, Req 18.4) and their panel.
 */
export interface OverlaySlot {
  readonly layers: readonly AppLayer[];
  readonly legend: ReactNode;
  readonly panel: ReactNode;
}

const NOTHING: readonly never[] = [];

export function MapScreen({ overlays }: { readonly overlays: OverlaySlot | null }) {
  const environment = useEnvironment();
  const { open } = useVigia();
  const [lib, setLib] = useState<MapLibreLike | null>(null);
  const [libFailure, setLibFailure] = useState<UiFailure | null>(null);

  useEffect(() => {
    let live = true;
    void environment.loadMap().then((loaded) => {
      if (!live) return;
      if (loaded.ok) setLib(loaded.value);
      else setLibFailure(loaded);
    });
    return () => {
      live = false;
    };
  }, [environment]);

  const model = useMemo(
    () =>
      open !== null && open.assessment.ok
        ? mapModel(open.assessment.value, environment.parameters)
        : null,
    [open, environment.parameters],
  );
  const drawn = model !== null && model.ok ? model.value : null;
  const overlayLayers = overlays?.layers ?? NOTHING;
  const layers = useMemo(
    () => [...(drawn?.layers ?? NOTHING), ...overlayLayers],
    [drawn, overlayLayers],
  );
  // UI's MapView does not show the result of its fit, so the extent is checked here with UI's own
  // builders: a map that would cross the antimeridian says so (Req 18.5).
  const crossing = useMemo(() => {
    if (drawn === null || drawn.observers.length === 0) return null;
    const observers = observerFeatures(drawn.observers);
    if (!observers.ok) return null;
    const lines = drawn.bearings.flatMap((b) => {
      const f = bearingFeatures(b, drawn.lineLengthM, WEDGE_ARC_STEP_RAD);
      return f.ok ? [f.value] : [];
    });
    const bounds = mapBounds([observers.value, ...lines]);
    return !bounds.ok && bounds.reason === 'crosses_antimeridian' ? bounds : null;
  }, [drawn]);
  const setAside = open !== null && open.assessment.ok && open.assessment.value.setAside.length > 0;

  return (
    <section data-testid="map-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Map</h1>
      {open === null && (
        <p style={LOOK.text}>No smoke yet: the map shows the sightings of a smoke.</p>
      )}
      <MapView
        lib={lib}
        tiles={environment.tiles}
        timer={environment.timer}
        observers={drawn?.observers ?? NOTHING}
        bearings={drawn?.bearings ?? NOTHING}
        lineLengthM={drawn?.lineLengthM ?? 5000}
        fix={drawn?.fix ?? null}
        layers={layers}
      />
      {crossing !== null && <FailureNotice failure={crossing} />}
      {libFailure !== null && <FailureNotice failure={libFailure} />}
      {environment.tilesFailure !== null && <FailureNotice failure={environment.tilesFailure} />}
      {model !== null && !model.ok && <FailureNotice failure={model} />}
      <section data-testid="map-legend" style={LOOK.panel}>
        <h2 style={LOOK.title}>What the map shows</h2>
        <ul style={{ ...LOOK.stack, margin: 0, paddingLeft: 20 }}>
          {drawn?.fixLegend != null && <li style={LOOK.text}>{drawn.fixLegend}</li>}
          <li style={LOOK.text}>
            Dots: where each observer stood for a used sighting. The Sightings tab gives how well
            each position is known.
          </li>
          <li style={LOOK.text}>
            Lines and wedges: the direction of each used sighting and its uncertainty.
          </li>
          {setAside && (
            <li style={LOOK.text}>
              Grey dashed lines and grey dots: sightings set aside, not used for the position.
            </li>
          )}
          <li style={LOOK.dim}>
            {environment.tiles === null
              ? 'Plain background: no map tiles are loaded, so no tile server is asked for anything.'
              : 'Map tiles: their source is named on the map.'}
          </li>
          {environment.tileSourceNote !== undefined && (
            <li style={LOOK.dim}>
              Map tiles: {environment.tileSourceNote.sourceName}.{' '}
              {environment.tileSourceNote.attribution}. Terms: {environment.tileSourceNote.termsUrl}
            </li>
          )}
        </ul>
        {overlays?.legend}
      </section>
      {overlays?.panel}
    </section>
  );
}
