# Vigia

Wildfire smoke triangulation on the Alidade skeleton (`apps/vigia`, package `@alidade/vigia`).
People who see a smoke column each take a compass sighting with a phone; the app crosses their
bearings into a position, and always draws it with its 95 % error ellipse and says in words how
far to trust it. It does not call or notify anyone: if there is fire, call the emergency number
first. The app only helps to say where the smoke is.

It is a static web page that opens from a link, with no account and no install.

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
(`assets/maplibre-gl-worker-*.mjs`); without it no map is drawn. A key or a variable that a build
reads is visible to everyone who opens the page: nothing in the repository is secret.

## Opening the page

On a laptop with no sensor, open it with `?mode=simulator` to start in Simulation mode (four
invented scenes, no camera, no network). Without it, a browser that defines
`DeviceOrientationEvent` starts in device mode, and the Sight screen offers "Try the simulator
instead" when no sensor reading arrives. The page has no service worker, so it must be opened once
with a connection; after that the sighting, the position, the Emergency text and the text code work
with no connection.

## The screens on a phone

The Sight screen is one column the height of the screen: Back, one line ("Aim at the base of the
smoke") with "How to aim", the camera, the compact readout, and at the foot the one action to take
now (Start, "Set north from the compass", Freeze, Capture). The first sighting starts the smoke and
the Smoke screen opens with "Sighting saved" and "Send this sighting"; with a smoke open you are
asked whether it is the same smoke. The Smoke screen's first view is the position with its 95 %
radius, how many sightings it rests on, what to watch for and "Show on map"; everything else is under
"Details and limits".

Sharing starts from "Send this sighting" or from a sighting's Share: what the code shows is stated
before you choose "Show QR code (someone beside you)" or "Send link (someone far away)"; the text
code is under "Other ways (no connection)". A code received is a compact card: choose whether it is
the same smoke, confirm, and the Smoke screen opens with the new result.

## Using it with another person

Each person sights the smoke from where they stand; then one sends a sighting by link, QR code or
text, and the other adds it and answers that it is the same smoke. The QR code and the link need the
receiving phone to load the page, so they work only where that phone has a connection; the text code
works between two phones that already have the page open.

## The map's tile provider

The repository names no tile provider. The build reads four variables (see `.env.example`):
`VITE_TILE_URL_TEMPLATE`, `VITE_TILE_ATTRIBUTION`, `VITE_TILE_SOURCE_NAME` and
`VITE_TILE_TERMS_URL`. With all four, the map has tiles from that provider's host and the app may
contact that host and no other for tiles. With any missing, the map has a plain background and
asks no tile server for anything. Read the provider's terms of use before the page has a public
address.

## Wind

The wind layer is off when the page opens. When the user switches it on, and on each press of
Refresh, the page sends one request to api.open-meteo.com with one point, the position of the Fix
(or the midpoint of the observers) rounded to 0.1 degree, and nothing else; it never asks on a
timer, and in Simulation mode it reads a made-up reading and sends nothing. The data is under
CC BY 4.0 and the service allows free use for non-commercial purposes only, at a limited number of
calls a day; its terms are at https://open-meteo.com/en/terms and are the owner's to accept before
the layer is left in a public page. The wind arrow is a model value at one point, not a forecast of
where a fire will spread.

## Hosting

The page contacts the host that serves it, api.open-meteo.com only when the wind layer is switched
on, and the host of the tile provider only when the build names one; nothing else, and the page has
no analytics, font or script from anywhere. Serve it over HTTPS (the camera and the sensors need
it), as static files.

The host should send `Referrer-Policy: strict-origin` first (the page also sets it in a `meta`
element, which is what counts on a host that sets no headers of ours, such as GitHub Pages): the
page's requests then carry its origin and nothing else, never a path, a query or the fragment, and
the tile provider, which blocks pages that withhold a referrer, gets the origin it asks for. The wind
request is sent by the app's Network gate with no referrer at all. Then a short cache lifetime for `index.html` so that a new build reaches users quickly (the
files under `assets/` have hashed names and can be cached for long), and should keep no log of the
full request address beyond what it needs. A sighting link carries its code after `#`, which a
browser never sends to the host.

## What leaves the phone

See [`docs/privacy.md`](../../docs/privacy.md): a table of every channel, what leaves the phone,
when, and who can see it. The app shows the same table on its "What leaves this phone" page.
