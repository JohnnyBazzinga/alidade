# @alidade/ui

The screen of a sighting, for both Alidade apps: the camera image, the geometry from a tap to a
direction, the sighting Session from a Sensor source to one capture, plain-language messages, the
reticle and readouts, the map that draws bearings and fixes with their 95 % ellipse, the Simulator
panel with its synthetic scenes, and a playground page. It builds on `@alidade/sensors` and
`@alidade/core`.

Import everything from the package root; there are no deep imports.

```ts
import { SightingScreen, createSessionDriver, messageFor } from '@alidade/ui';
```

## The map's stylesheet

The package's public API imports no CSS. An app that shows the map (`MapView`, or
`createMapAdapter` with `loadMapLibre`) imports the map library's stylesheet once, at its entry:

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
```

`maplibre-gl` itself is loaded only when `loadMapLibre()` is called, by a dynamic import, so
importing `@alidade/ui` does not load it.

## Tiles and environment variables

The package ships no tile source, URL or key. A Tile source is passed in as data
(`{ tileUrlTemplates, attribution, minZoom, maxZoom, tileSizePx }`), or `null` for a plain
background with no network request. The Playground reads it from two environment variables,
documented with empty values in [`.env.example`](./.env.example):

| Variable                 | Meaning                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `VITE_TILE_URL_TEMPLATE` | One or more tile URL templates with `{z}`, `{x}` and `{y}`, separated by whitespace |
| `VITE_TILE_ATTRIBUTION`  | The attribution the tile provider requires; shown on the map                        |

Copy `.env.example` to `.env.local` and fill it in. `.env*` files other than `.env.example` are
ignored by git. With the variables absent, the map is drawn on a plain background.

## Layers of your own on the map

`MapView` takes a `layers` prop, and the Map adapter has `setLayer(id, collection, paint)` and
`clearLayer(id)`, for what an app draws besides the skeleton's observers, bearing lines, wedges
and Fix: hotspots, wind, lines of position, a sighting set aside.

```tsx
<MapView … layers={[{ id: 'hotspots', collection, paint: { kind: 'circle', colour: '#D2691E', radiusPx: 6 } }]} />
```

- Build each feature with `appFeature(kind, id, { type: 'point' | 'line' | 'polygon', … })` from Positions: it writes the map's longitude-first degrees for you, closes a polygon's ring, and refuses a Position that is not Supported (`unsupported_position`), a line of fewer than 2 or a polygon of fewer than 3 Positions.
- `collection` is `{ type: 'FeatureCollection', features }`. Each feature has an `id` and a
  `properties` of `{ kind, id }` (both non-empty strings), and a Point, LineString or Polygon whose
  coordinates are `[lonDeg, latDeg]` at Supported positions. `properties` keeps those two fields.
  A feature of one of the skeleton's own kinds (`observer`, `bearing-line`, `bearing-wedge`, `fix`,
  `fix-ellipse-95`) is refused: a Fix is drawn by `setFix` alone, with its ellipse. At most
  `MAX_LAYER_FEATURES` (2 000) features per layer and `MAX_APP_LAYERS` (8) layers.
- `paint` is `{ kind: 'fill', colour, opacity? }`, `{ kind: 'line', colour, widthPx, opacity?, dash? }`
  or `{ kind: 'circle', colour, radiusPx, opacity? }`. `colour` is `#RRGGBB`; `widthPx` and
  `radiusPx` are in `(0, 16]`; `opacity` in `(0, 1]`; `dash` is up to 4 positive numbers. A fill
  draws polygons, a line draws lines and polygon outlines, a circle draws points. There is no text:
  put labels in your own legend.
- `id` is 1 to 32 characters, a lower-case letter then lower-case letters, digits or hyphens.
- Layers are drawn under every layer of the skeleton, in the order in which their ids were first
  set, so they never hide the Fix or its ellipse. They are not part of the fit unless a layer says
  `fit: true` (`MapView`) or you pass their collections as the second argument of `fitToFeatures`.
- A refusal is `invalid_number` naming the field (`id`, `paint.widthPx`, `layers`, `features`,
  `features[3].geometry.coordinates`, …) and leaves the layer as it was. Do not change a collection
  after giving it; the adapter keeps a copy.

## Scenes of your own

`sceneFromOffsets(spec)` builds a Synthetic scene from offsets in metres on the Local plane of an
origin you choose, and `scriptForStation(scene, stationId, aimTargetId, options)` gives the Simulator
script of one Station, pointed at one Target and holding that pose. The options are the fields the
catalogue varies (start time, noise, frame, accuracy of the Station's fix, permissions, …); the
defaults are the catalogue's. The catalogue is built through them, so a scene of yours behaves like
the ones that ship. Keep every position synthetic.

## No defaults for the camera

The camera's field of view and the tap's 1-sigma are passed in by the caller and never assumed.
Without them, sighting along the crosshair still works; a tapped point is refused with the Message
of `calibration_missing`.

## Playground

`pnpm --filter @alidade/ui build:playground` builds `playground/` into `playground/dist/`, with
relative asset paths, so the folder can be served as static files from any path (it needs
`https` or `localhost` on a phone, for the camera and the motion sensors). On a laptop with no
motion sensor it opens in simulator mode.

## Tests

| Command                               | What it runs                                                               |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm --filter @alidade/ui test`      | every test once, properties at 200 cases (the capped ones at their counts) |
| `pnpm --filter @alidade/ui test:deep` | the property files at the checkpoint counts                                |
