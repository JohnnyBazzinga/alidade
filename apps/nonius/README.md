# Nonius

A position fix from Sun sights taken with a phone, without GPS. Built on the Alidade skeleton.
You point the phone's camera at the Sun at two or more times of the day, without moving; the app
works out where you are and always draws the position with its 95 % area. Nonius is a backup and a
teaching instrument, not navigation equipment.

## Build commands

Run from the repository root.

| Purpose     | Command                                   |
| ----------- | ----------------------------------------- |
| Install     | `pnpm install`                            |
| Tests, once | `pnpm --filter @alidade/nonius test`      |
| Deep tests  | `pnpm --filter @alidade/nonius test:deep` |
| Type check  | `pnpm --filter @alidade/nonius typecheck` |
| Build       | `pnpm --filter @alidade/nonius build`     |

The build writes `apps/nonius/dist/`: a static page whose every address is relative, with the map
library's worker file beside it. Nothing in the repository is secret.

## The reviewer's path

A laptop has no Sun to sight. A browser with no orientation sensor opens the page in Simulation
mode (a banner says so on every screen); a phone can switch to it with the control on the first
screen. Five invented scenes, each at a made-up place, with the phone's altitude bias of -3.3°:
A good day, Sights too close in time, Sights ten minutes apart, One sight disagrees, and A phone
never calibrated. A one-row bar under the banner holds the scene and the Sight time; the full time and the note on the still Sun are on the Sight screen.

1. Tap Sight the Sun, then Start, Freeze and Capture in the panel.
2. Tap Done, then Next (the Next sight time control) in the bar, and sight again.
3. After the last sight, read the position and the words, and compare with the true position.

The simulated Sun stands still, so a sight taken a minute late is up to 15′ off. In the last scene,
measure the index error from the Fix screen and see the same sights give a smaller area.

## What it measures

The Sun's apparent height above the horizontal, measured against gravity, at a time known to the
second. At that moment the Sun is overhead at one place; everyone who sees it at that height is on
a circle around it. Two circles cross at two places, and the Sun's direction by the compass, a
third sight, or your own choice picks one. The position and its ellipse come from Core's solver,
with the error that every sight of one phone shares added by sensitivity.

## Its limits

The 95 % area holds only if every sight was of the centre of the Sun's glare, you did not move, the
phone's clock was right and the errors are as stated. One degree of altitude is about 111 km (60
nautical miles) on the ground, and a phone that was never calibrated may be off by 3.5°. Each
minute of error in the phone's clock moves the position by up to 28 km east or west. No GPS is
used for the position. Below 5° or above 80° of altitude a sight is refused. Look only at the
screen, never at the Sun, and never through binoculars or any lens.

## Measuring the index error

A phone's altitude is off by a constant, like a sextant's index error. On the Fix screen, tap
Measure the index error, then Use this phone's location (asked once, used only to compute the
Sun's altitude for this, never for a position, and not kept), take a few sights, and Save. The
error and its uncertainty are kept with the sights; a value above 10° is refused as a mistake.

## Sources

The Sun's position comes from the `astronomy-engine` library, 2.1.19, checked against the values
printed in Meeus, Astronomical Algorithms, and by the U.S. Naval Observatory. The refraction of the
air is Bennett's formula (G. G. Bennett, 1982, as given in Meeus, chapter 16).

## The map's tile provider

The repository names no tile provider. The build reads four variables (see `.env.example`):
`VITE_TILE_URL_TEMPLATE`, `VITE_TILE_ATTRIBUTION`, `VITE_TILE_SOURCE_NAME` and
`VITE_TILE_TERMS_URL`. With all four, the map has tiles from that provider. With any missing, the
map has a plain background and asks no tile server for anything. Read the provider's terms of use
before the page has a public address.
