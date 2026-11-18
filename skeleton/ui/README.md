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
