// What leaves the phone, when, and who sees it, for each channel of the release (Req 15.3, design
// D20). The table is data: the Share sheet and the privacy page render it, and `docs/privacy.md`
// holds the same table, kept equal to this one by a test (task 16). The rows are the
// requirement's own words, in its order, document references included. The Hotspots row is
// marked "second release": the hotspot Overlay is not built in the first release. The Tiles row
// names the site's origin, sent as the referrer since the page's policy became `strict-origin`
// (Req 10.2 as amended on 2026-11-20); Req 15.3's own table does not say it yet.

export interface PrivacyRow {
  readonly channel: string;
  readonly whatLeaves: string;
  readonly when: string;
  readonly whoSees: string;
}

function row(channel: string, whatLeaves: string, when: string, whoSees: string): PrivacyRow {
  return Object.freeze({ channel, whatLeaves, when, whoSees });
}

export const PRIVACY_TABLE: readonly PrivacyRow[] = Object.freeze([
  row(
    'Link (Requirement 10)',
    'the Sighting code, in the fragment of a link the user sends',
    "on the user's Share action",
    'the messaging service and its operator, the recipient; never the Vigia host (a fragment is not sent in a request), unless the messaging service fetches the link for a preview, in which case it fetches without the fragment',
  ),
  row(
    'QR code (of the link)',
    'the same link, drawn on the screen',
    "on the user's Share action",
    "the person who reads it with a camera application, and whatever that application does with the address (it may look the address up; Vigia cannot control it, Device check V1); then the app's host receives the request for the page without the fragment",
  ),
  row(
    'Text code',
    'the same code, shown or copied',
    "on the user's Share action",
    'whoever the user pastes it to',
  ),
  row(
    'Relay (if chosen, Open question O1)',
    "the same code, to the relay, with the phone's network address",
    "on the user's Share action",
    "the relay's operator and everyone holding the Incident id",
  ),
  row(
    'Hotspots (second release)',
    "an area, snapped to the hotspot grid, and the phone's network address",
    'when the user switches the Overlay on, and on refresh',
    'the hotspot Source',
  ),
  row(
    'Wind',
    "one point, rounded to the wind grid, and the phone's network address",
    'when the user switches the Overlay on, and on refresh',
    'the wind Source',
  ),
  row(
    'Tiles',
    "the tile addresses of the area on the screen, the site's origin as the referrer (no path, no query, no fragment), and the phone's network address",
    'while the map is shown and a Tile source is set',
    'the tile Source',
  ),
  row(
    'The page itself',
    "a request for the page's files, with the phone's network address",
    'on opening',
    'the host of the app',
  ),
  row(
    'Clipboard and share sheet',
    'the text the user chooses',
    "on the user's act",
    'wherever the user pastes or sends it',
  ),
]);
