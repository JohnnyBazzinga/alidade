# What leaves the phone: Vigia

Vigia has no account, no cookie, no analytics, no advertising, no remote font or script, no
error-reporting service and no telemetry. A sighting stays on the phone, in the browser's own
storage, until its smoke expires (24 hours after its newest sighting) or the user deletes it.
Something leaves the phone only through one of the channels below. Each row is checked by a test
against the table that the app itself shows on its "What leaves this phone" page, so this document
and the app cannot differ.

A sighting code holds the observer's position to about 1 m, its accuracy, the time, the direction
and its uncertainty, and the smoke it belongs to. Whoever holds a code sees where the observer stood
and when, and a code cannot be taken back once it has left the phone. A code has no proof of who
made it.

| Channel                             | What leaves the phone                                                         | When                                                  | Who sees it                                                                                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link (Requirement 10)               | the Sighting code, in the fragment of a link the user sends                   | on the user's Share action                            | the messaging service and its operator, the recipient; never the Vigia host (a fragment is not sent in a request), unless the messaging service fetches the link for a preview, in which case it fetches without the fragment                             |
| QR code (of the link)               | the same link, drawn on the screen                                            | on the user's Share action                            | the person who reads it with a camera application, and whatever that application does with the address (it may look the address up; Vigia cannot control it, Device check V1); then the app's host receives the request for the page without the fragment |
| Text code                           | the same code, shown or copied                                                | on the user's Share action                            | whoever the user pastes it to                                                                                                                                                                                                                             |
| Relay (if chosen, Open question O1) | the same code, to the relay, with the phone's network address                 | on the user's Share action                            | the relay's operator and everyone holding the Incident id                                                                                                                                                                                                 |
| Hotspots (second release)           | an area, snapped to the hotspot grid, and the phone's network address         | when the user switches the Overlay on, and on refresh | the hotspot Source                                                                                                                                                                                                                                        |
| Wind                                | one point, rounded to the wind grid, and the phone's network address          | when the user switches the Overlay on, and on refresh | the wind Source                                                                                                                                                                                                                                           |
| Tiles                               | the tile addresses of the area on the screen, and the phone's network address | while the map is shown and a Tile source is set       | the tile Source                                                                                                                                                                                                                                           |
| The page itself                     | a request for the page's files, with the phone's network address              | on opening                                            | the host of the app                                                                                                                                                                                                                                       |
| Clipboard and share sheet           | the text the user chooses                                                     | on the user's act                                     | wherever the user pastes or sends it                                                                                                                                                                                                                      |

### Link (Requirement 10)

The link is the address of the Vigia page followed by `#` and the sighting code. Everything after
`#` stays in the browser: it is not part of the request for the page. The link leaves the phone only
when the user presses Copy link or Share. The messaging service that carries it, and its operator,
can read the whole link. When the receiving phone opens it, the page reads the code, shows it as a
card that the user can add or ignore, and removes the code from the address bar.

### QR code (of the link)

The QR code is the same link drawn on the screen of the sender, as an image made by the page itself
(no image is loaded from anywhere). It leaves the phone only as light: whoever points a camera at it
reads the link, and what that camera application does with the address is outside Vigia's control
(it may look the address up). Then the receiving phone asks the host of the app for the page, without
the fragment, and needs a connection to do so.

### Text code

The text code is the same code as ten groups of five characters. It leaves the phone when the user
shows it, reads it out or copies it, and goes to whoever the user gives it to. It works with a phone
that already has the page open and no connection at all.

### Relay (if chosen, Open question O1)

There is no relay in this release. The row stays so that the document names the choice that has not
been made: if the owner adds one, the code would go to it with the phone's network address, and the
relay's operator and everyone who knows the smoke's identifier could read it.

### Hotspots (second release)

The satellite-hotspot layer is not part of this release and sends nothing. It is named here so that
the table is complete: when it is built it will send an area snapped to a grid, never a position
finer than the grid, and the phone's network address, on the user's act.

### Wind

The wind layer is off when the page opens and sends nothing until the user switches it on. Switching
it on sends one request to api.open-meteo.com (terms: https://open-meteo.com/en/terms), and each
press of Refresh sends one more. The request carries one point, the position of the Fix (or, with no
Fix, the midpoint of the observers), rounded to a grid of 0.1 degree, about 11 km, and the phone's
network address, which the host sees as it sees every visitor. It carries no identifier, no time, no
direction of a sighting and no cookie or header, and it is never repeated on a timer. In Simulation
mode the layer reads a made-up reading inside the page and sends nothing. The service asks for
attribution (CC BY 4.0) and limits free use to non-commercial use.

### Tiles

The map has a plain background unless the build names a tile provider (four build variables, see the
README). With a provider, the page asks that provider's host for the tiles of the area on the screen,
so the provider sees which area the user looks at and the phone's network address. The repository
names no provider, and the page contacts no other host for tiles.

### The page itself

Opening the page asks the host of the app for its files. That host sees the phone's network address
and whatever its own logs keep. Because a link's code is in the fragment, it is not in that request.
There is no service worker, so the page has to be opened once with a connection; once it is open, the
sighting, the Fix, the Emergency text and the text code work with no connection, and the map's tiles,
the wind layer and loading the page on another phone from a QR code or a link need one.

### Clipboard and share sheet

Copy and Share put a text of the user's choosing, a code, a link, or the Emergency text, in the
phone's clipboard or in its share sheet. Vigia does nothing after that: the text goes wherever the
user pastes or sends it, and any app that reads the clipboard can read it.
