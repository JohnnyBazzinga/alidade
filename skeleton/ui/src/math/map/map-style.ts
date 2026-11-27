// The map style (Req 15.4, 15.7, design §7.10, D12): built once, as plain JSON, by a pure
// function. No glyphs, no sprite, no text layer, so the map asks for nothing but tiles.

/** The dark half of every two-tone line (the theme's `outline`, §7.18). */
export const MAP_DARK = '#0A0C0E';
/** The light core of the bearing lines and observers (the theme's `mapInk`). */
export const MAP_LIGHT = '#F2EEE3';
/** The Fix and its ellipse (the theme's `brass`). */
export const MAP_FIX = '#E3AE45';
/** The plain background drawn with no Tile source. */
export const MAP_BACKGROUND = '#DADADA';

/** Where the map's tiles come from (Req 15.2). */
export interface TileSource {
  readonly tileUrlTemplates: readonly string[];
  readonly attribution: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly tileSizePx: number;
}

/**
 * The layer that application layers are added before (Req 15.16, design D31.4): the first layer of
 * the skeleton that draws data. A layer added before it is under the Wedges, the lines, the
 * observers and the Fix with its ellipse, and above the background and the tiles.
 */
export const APP_LAYERS_BEFORE_ID = 'wedges-fill';

/** The ids of the GeoJSON sources the adapter writes. The Fix and its ellipse share `fix`. */
export type GeoJsonSourceId = 'observers' | 'wedges' | 'bearings' | 'fix';
export const GEOJSON_SOURCE_IDS: readonly GeoJsonSourceId[] = [
  'observers',
  'wedges',
  'bearings',
  'fix',
];

export interface MapLayer {
  readonly id: string;
  readonly type: 'background' | 'raster' | 'fill' | 'line' | 'circle';
  readonly source?: string;
  readonly filter?: readonly unknown[];
  readonly paint: Readonly<Record<string, string | number | readonly number[]>>;
}

export interface MapStyle {
  readonly version: 8;
  readonly sources: Readonly<Record<string, unknown>>;
  readonly layers: readonly MapLayer[];
}

const EMPTY = { type: 'FeatureCollection', features: [] };

function kindIs(kind: string): readonly unknown[] {
  return ['==', ['get', 'kind'], kind];
}

/**
 * The whole style: a plain background, the raster tiles when there is a Tile source, then, in
 * draw order, the Wedges under the lines, the ellipse under the Fix's point (Req 15.7). Every line
 * is two-tone, a light core of 2.5 CSS px over a dark casing of 5, so that it holds 7:1 against a
 * dark and a light map.
 *
 * The 95 % ellipse is what the map is for (task group 30, design D34): its fill lies under the
 * lines, so that it hides none of them, and its outline (a brass core of 3 over a dark casing of
 * 6) over the lines and the Wedges, so that it is seen where they cross it. The Fix's point is a
 * small dot, 10 CSS px across, so that it does not cover a small ellipse.
 */
/**
 * The map's paints (Req 22.16): the light core, the dark casing, the Fix's colour and the Wedges'
 * fill opacity. Every theme but Mira draws the defaults; Mira draws its yellow over its ink.
 */
export interface MapPalette {
  readonly light: string;
  readonly dark: string;
  readonly fix: string;
  readonly wedgeOpacity: number;
}

export const DEFAULT_MAP_PALETTE: MapPalette = {
  light: MAP_LIGHT,
  dark: MAP_DARK,
  fix: MAP_FIX,
  wedgeOpacity: 0.18,
};

/** Mira's map (2026-11-27): yellow lines, Wedges, dots and ellipse, each cased in its ink. */
export const MIRA_MAP_PALETTE: MapPalette = {
  light: '#FFD400',
  dark: '#0F1F1A',
  fix: '#FFD400',
  wedgeOpacity: 0.45,
};

export function buildMapStyle(
  tiles: TileSource | null,
  palette: MapPalette = DEFAULT_MAP_PALETTE,
): MapStyle {
  const { light: MAP_LIGHT_, dark: MAP_DARK_, fix: MAP_FIX_ } = palette;
  const sources: Record<string, unknown> = {};
  for (const id of GEOJSON_SOURCE_IDS) sources[id] = { type: 'geojson', data: EMPTY };
  const layers: MapLayer[] = [
    { id: 'background', type: 'background', paint: { 'background-color': MAP_BACKGROUND } },
  ];
  if (tiles !== null) {
    sources.tiles = {
      type: 'raster',
      tiles: [...tiles.tileUrlTemplates],
      tileSize: tiles.tileSizePx,
      minzoom: tiles.minZoom,
      maxzoom: tiles.maxZoom,
      attribution: tiles.attribution,
    };
    layers.push({ id: 'tiles', type: 'raster', source: 'tiles', paint: {} });
  }
  layers.push(
    {
      id: 'wedges-fill',
      type: 'fill',
      source: 'wedges',
      paint: { 'fill-color': MAP_LIGHT_, 'fill-opacity': palette.wedgeOpacity },
    },
    {
      id: 'wedges-outline',
      type: 'line',
      source: 'wedges',
      paint: { 'line-color': MAP_DARK_, 'line-width': 2 },
    },
    {
      id: 'fix-ellipse-fill',
      type: 'fill',
      source: 'fix',
      filter: kindIs('fix-ellipse-95'),
      paint: { 'fill-color': MAP_FIX_, 'fill-opacity': 0.25 },
    },
    {
      id: 'bearings-casing',
      type: 'line',
      source: 'bearings',
      paint: { 'line-color': MAP_DARK_, 'line-width': 5 },
    },
    {
      id: 'bearings-core',
      type: 'line',
      source: 'bearings',
      paint: { 'line-color': MAP_LIGHT_, 'line-width': 2.5 },
    },
    {
      id: 'fix-ellipse-casing',
      type: 'line',
      source: 'fix',
      filter: kindIs('fix-ellipse-95'),
      paint: { 'line-color': MAP_DARK_, 'line-width': 6 },
    },
    {
      id: 'fix-ellipse-core',
      type: 'line',
      source: 'fix',
      filter: kindIs('fix-ellipse-95'),
      paint: { 'line-color': MAP_FIX_, 'line-width': 3 },
    },
    {
      id: 'observers-casing',
      type: 'circle',
      source: 'observers',
      paint: { 'circle-color': MAP_DARK_, 'circle-radius': 9 },
    },
    {
      id: 'observers-core',
      type: 'circle',
      source: 'observers',
      paint: { 'circle-color': MAP_LIGHT_, 'circle-radius': 6 },
    },
    {
      id: 'fix-casing',
      type: 'circle',
      source: 'fix',
      filter: kindIs('fix'),
      paint: { 'circle-color': MAP_DARK_, 'circle-radius': 5 },
    },
    {
      id: 'fix-core',
      type: 'circle',
      source: 'fix',
      filter: kindIs('fix'),
      paint: { 'circle-color': MAP_FIX_, 'circle-radius': 3 },
    },
  );
  return { version: 8, sources, layers };
}
