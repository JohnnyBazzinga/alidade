// The Map screen (design §9, §7.18; Req 6.1, 6.11, 18.1 to 18.7): UI's MapView with the used
// observers, their lines and Wedges, the Fix drawn with its 95 % ellipse by UI's `setFix` alone,
// and the set-aside Sightings in grey dashes through the general layers. Then the legend, which
// names every drawing, and the Overlays panel when the Overlays module is present. This screen
// knows nothing of the Overlays but the slot it is given (Req 1.10): the App builds it.

import { MapView, ROLE_VARS, type AppLayer, type MapLibreLike, type UiFailure } from '@alidade/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useHeader } from './header-context';
import { directionText } from '../math/fix/format';
import { mapModel } from '../math/fix/map-model';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK, SHAPE } from './look';
import { useVigia } from './store';

/**
 * What the Overlays add to this screen: their layers, their entries of the legend (each drawing
 * with its Source and time, Req 18.4) and their panel.
 */
export interface OverlaySlot {
  readonly layers: readonly AppLayer[];
  readonly legend: ReactNode;
  readonly panel: ReactNode;
  /** A wind reading is on the map: the sighting guidance says that smoke drifts downwind (Req 13.5). */
  readonly windShown: boolean;
}

const NOTHING: readonly never[] = [];

/**
 * The map is this screen's main content (task 21.6): about the width of the screen, at least
 * 320 CSS px, and never more than 70 % of the screen's height. A map whose extent crosses the
 * antimeridian is said by UI's MapView from its own fit (Req 18.5, skeleton-ui task group 30).
 */
const MAP_HEIGHT = 'clamp(320px, 100vw, 70svh)';

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
  const setAside = open !== null && open.assessment.ok && open.assessment.value.setAside.length > 0;
  // Mira: the App's header is the brand row; the screen says its own title.
  useHeader(null);
  const used = open !== null && open.assessment.ok ? open.assessment.value.used : [];
  const located =
    open !== null && open.assessment.ok && open.assessment.value.fix !== null
      ? open.assessment.value.fix.ok
      : false;
  const only = used.length === 1 && !located ? used[0] : undefined;
  const chipText =
    only === undefined
      ? null
      : directionText(only.sighting.bearing.azimuthRad, only.sighting.bearing.azimuthSigmaRad);
  const chip = chipText !== null && chipText.ok ? chipText.value : null;
  const legendRow = (glyph: ReactNode, text: string, dim = false) => {
    const colon = text.indexOf(': ');
    return (
      <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ flex: '0 0 auto', width: 32, height: 32 }}>
          {glyph}
        </span>
        <span style={{ ...(dim ? LOOK.dim : LOOK.text), fontSize: 14, lineHeight: 1.45 }}>
          {colon < 0 ? (
            text
          ) : (
            <>
              <strong style={{ fontWeight: 800, color: ROLE_VARS.ink }}>
                {text.slice(0, colon + 1)}
              </strong>{' '}
              {text.slice(colon + 2)}
            </>
          )}
        </span>
      </li>
    );
  };
  const dotGlyph = (
    <svg data-art="legend" viewBox="0 0 32 32" width="32" height="32">
      <circle
        cx="16"
        cy="16"
        r="8"
        style={{ fill: ROLE_VARS.primary, stroke: ROLE_VARS.ink, strokeWidth: 3.5 }}
      />
    </svg>
  );
  const wedgeGlyph = (
    <svg data-art="legend" viewBox="0 0 32 32" width="32" height="32">
      <path
        d="M5 28L20 3l7 4z"
        style={{
          fill: ROLE_VARS.primary,
          fillOpacity: 0.5,
          stroke: ROLE_VARS.ink,
          strokeWidth: 2,
          strokeLinejoin: 'round',
        }}
      />
      <path d="M5 28L23.5 5" style={{ stroke: ROLE_VARS.ink, strokeWidth: 2 }} />
    </svg>
  );
  const tilesGlyph = (
    <svg
      data-art="legend"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      style={{ fill: 'none', stroke: ROLE_VARS.inkDim, strokeWidth: 2 }}
    >
      <rect x="5" y="5" width="22" height="22" rx="3" />
      <path d="M16 5v22M5 16h22" />
    </svg>
  );

  return (
    <section data-testid="map-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Map</h1>
      {open === null && (
        <p style={LOOK.text}>No smoke yet: the map shows the sightings of a smoke.</p>
      )}
      <div
        data-part="map-frame"
        style={{
          position: 'relative',
          borderRadius: SHAPE.cardRadius,
          border: `2px solid ${ROLE_VARS.ink}`,
          overflow: 'hidden',
          flex: '0 0 auto',
        }}
      >
        {/* Mira's chip over the map: the direction of the one used sighting, while there is no Fix. */}
        {chip !== null && (
          <span
            data-part="bearing-chip"
            style={{
              ...LOOK.caption,
              position: 'absolute',
              left: 12,
              top: 12,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              height: 30,
              padding: '0 12px',
              borderRadius: 15,
              background: ROLE_VARS.ink,
              color: ROLE_VARS.card,
              letterSpacing: '0.8px',
              pointerEvents: 'none',
            }}
          >
            {chip}
          </span>
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
          height={MAP_HEIGHT}
        />
      </div>
      {libFailure !== null && <FailureNotice failure={libFailure} />}
      {environment.tilesFailure !== null && <FailureNotice failure={environment.tilesFailure} />}
      {model !== null && !model.ok && <FailureNotice failure={model} />}
      <section data-testid="map-legend" style={{ ...LOOK.card, gap: 14 }}>
        <h2 style={LOOK.cardTitle}>What the map shows</h2>
        <ul style={{ ...LOOK.stack, gap: 14, margin: 0, padding: 0, listStyle: 'none' }}>
          {drawn?.fixLegend != null && legendRow(dotGlyph, drawn.fixLegend)}
          {legendRow(
            dotGlyph,
            'Dots: where each observer stood for a used sighting. The Sightings tab gives how well each position is known.',
          )}
          {legendRow(
            wedgeGlyph,
            'Lines and wedges: the direction of each used sighting and its uncertainty.',
          )}
          {setAside &&
            legendRow(
              wedgeGlyph,
              'Grey dashed lines and grey dots: sightings set aside, not used for the position.',
            )}
          {legendRow(
            tilesGlyph,
            (environment.tiles === null
              ? 'Plain background: no map tiles are loaded, so no tile server is asked for anything.'
              : 'Map tiles: their source is named on the map.') +
              (environment.tileSourceNote === undefined
                ? ''
                : ` ${environment.tileSourceNote.sourceName}. ${environment.tileSourceNote.attribution}. Terms: ${environment.tileSourceNote.termsUrl}`),
            true,
          )}
        </ul>
        {overlays?.legend}
      </section>
      {overlays?.panel}
    </section>
  );
}
