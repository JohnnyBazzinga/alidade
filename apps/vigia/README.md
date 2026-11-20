# Vigia

Wildfire smoke triangulation on the Alidade skeleton (`apps/vigia`, package `@alidade/vigia`).

## Build

From the repository root:

```
pnpm install
pnpm --filter @alidade/vigia test
pnpm --filter @alidade/vigia typecheck
pnpm --filter @alidade/vigia build
```

The build writes `apps/vigia/dist/`: a static page whose every address is relative, so the folder
can be served from any path of a static host. It includes the map library's worker file
(`assets/maplibre-gl-worker-*.mjs`); without it no map is drawn.

## Opening the page

On a laptop with no sensor, open it with `?mode=simulator` to start in Simulation mode (four
invented scenes, no camera, no network). Without it, a browser that defines
`DeviceOrientationEvent` starts in device mode, and the Sight screen offers "Try the simulator
instead" when no sensor reading arrives.

## The map's tile provider

The repository names no tile provider. The build reads four variables (see `.env.example`):
`VITE_TILE_URL_TEMPLATE`, `VITE_TILE_ATTRIBUTION`, `VITE_TILE_SOURCE_NAME` and
`VITE_TILE_TERMS_URL`. With all four, the map has tiles from that provider's host and the app may
contact that host and no other for tiles. With any missing, the map has a plain background and
asks no tile server for anything.
