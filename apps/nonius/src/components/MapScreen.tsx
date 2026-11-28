// The Map screen (design §9, D16; Req 9.4 to 9.6, 11.4): UI's MapView with the Shown Fix drawn
// with its 95 % ellipse by `setFix` alone, the arcs of the Circles near it, Two places through
// layers, the GPS marker, then the legend and the tile source's name and terms.

import { MapView, type MapLibreLike, type UiFailure } from '@alidade/ui';
import { useEffect, useMemo, useState } from 'react';
import { mapModel } from '../math/fix/map-model';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useNonius } from './store';

const NOTHING: readonly never[] = [];
/** The map is this screen's main content: about the width of the screen, at most 70 % of its height. */
const MAP_HEIGHT = 'clamp(320px, 100vw, 70svh)';
/** MapView draws no Bearing lines here; this is the length it asks for with none. Unit: m. */
const NO_LINE_LENGTH_M = 5000;

export function MapScreen() {
  const environment = useEnvironment();
  const { assessment, comparison } = useNonius();
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
    () => (assessment.ok ? mapModel(assessment.value, comparison, environment.parameters) : null),
    [assessment, comparison, environment.parameters],
  );
  const drawn = model !== null && model.ok ? model.value : null;
  const kind = assessment.ok ? assessment.value.kind : 'failed';
  const setAside = assessment.ok && assessment.value.setAside.length > 0;
  const note = environment.tileSourceNote;

  return (
    <section data-testid="map-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Map</h1>
      {(kind === 'empty' || kind === 'one' || kind === 'failed') && (
        <p style={LOOK.text}>The map shows the position once two sights give one.</p>
      )}
      <MapView
        lib={lib}
        tiles={environment.tiles}
        timer={environment.timer}
        observers={NOTHING}
        bearings={NOTHING}
        lineLengthM={NO_LINE_LENGTH_M}
        fix={drawn?.fix ?? null}
        layers={drawn?.layers ?? NOTHING}
        height={MAP_HEIGHT}
      />
      {libFailure !== null && <FailureNotice failure={libFailure} />}
      {environment.tilesFailure !== null && <FailureNotice failure={environment.tilesFailure} />}
      {model !== null && !model.ok && <FailureNotice failure={model} />}
      <section data-testid="map-legend" style={LOOK.panel}>
        <h2 style={LOOK.heading}>What the map shows</h2>
        <ul style={{ ...LOOK.stack, margin: 0, paddingLeft: 20 }}>
          {kind === 'fix' && (
            <li style={LOOK.text}>
              The point and its ellipse: where you probably are, and its 95 % area.
            </li>
          )}
          {kind === 'two_places' && (
            <li style={LOOK.text}>
              Two places, A and B, each a point with its 95 % ellipse: you are at one of them.
            </li>
          )}
          {(kind === 'fix' || kind === 'two_places') && (
            <li style={LOOK.text}>
              Blue arcs: the circle of each used sight, drawn near the position.
            </li>
          )}
          {setAside && (
            <li style={LOOK.text}>
              Grey dashed arcs: sights set aside, not used for the position.
            </li>
          )}
          {comparison !== null && (
            <li style={LOOK.text}>
              The green dot: this phone&apos;s GPS position, for comparison only.
            </li>
          )}
          <li style={LOOK.dim}>
            {environment.tiles === null
              ? 'Plain background: no map tiles are loaded, so no tile server is asked for anything.'
              : 'Map tiles: their source is named below.'}
          </li>
          {note !== undefined && (
            <li style={LOOK.dim}>
              Map tiles: {note.sourceName}. {note.attribution}. Terms: {note.termsUrl}
            </li>
          )}
        </ul>
      </section>
    </section>
  );
}
