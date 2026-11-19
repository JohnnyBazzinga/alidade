import { describe, expect, it } from 'vitest';
import { PRIVACY_TABLE } from './privacy-table';

/**
 * The nine rows of the table of Req 15.3, typed out on purpose and in the requirement's order:
 * what leaves the phone, when, and who sees it, for each channel. A drift in the source fails
 * here. The cells are the requirement's own words, document references included.
 */
const REQ_15_3 = [
  {
    channel: 'Link (Requirement 10)',
    whatLeaves: 'the Sighting code, in the fragment of a link the user sends',
    when: "on the user's Share action",
    whoSees:
      'the messaging service and its operator, the recipient; never the Vigia host (a fragment is not sent in a request), unless the messaging service fetches the link for a preview, in which case it fetches without the fragment',
  },
  {
    channel: 'QR code (of the link)',
    whatLeaves: 'the same link, drawn on the screen',
    when: "on the user's Share action",
    whoSees:
      "the person who reads it with a camera application, and whatever that application does with the address (it may look the address up; Vigia cannot control it, Device check V1); then the app's host receives the request for the page without the fragment",
  },
  {
    channel: 'Text code',
    whatLeaves: 'the same code, shown or copied',
    when: "on the user's Share action",
    whoSees: 'whoever the user pastes it to',
  },
  {
    channel: 'Relay (if chosen, Open question O1)',
    whatLeaves: "the same code, to the relay, with the phone's network address",
    when: "on the user's Share action",
    whoSees: "the relay's operator and everyone holding the Incident id",
  },
  {
    channel: 'Hotspots (second release)',
    whatLeaves: "an area, snapped to the hotspot grid, and the phone's network address",
    when: 'when the user switches the Overlay on, and on refresh',
    whoSees: 'the hotspot Source',
  },
  {
    channel: 'Wind',
    whatLeaves: "one point, rounded to the wind grid, and the phone's network address",
    when: 'when the user switches the Overlay on, and on refresh',
    whoSees: 'the wind Source',
  },
  {
    channel: 'Tiles',
    whatLeaves: "the tile addresses of the area on the screen, and the phone's network address",
    when: 'while the map is shown and a Tile source is set',
    whoSees: 'the tile Source',
  },
  {
    channel: 'The page itself',
    whatLeaves: "a request for the page's files, with the phone's network address",
    when: 'on opening',
    whoSees: 'the host of the app',
  },
  {
    channel: 'Clipboard and share sheet',
    whatLeaves: 'the text the user chooses',
    when: "on the user's act",
    whoSees: 'wherever the user pastes or sends it',
  },
] as const;

describe('PRIVACY_TABLE (Req 15.3, design D20)', () => {
  it('has the nine rows of Req 15.3, in order, cell by cell', () => {
    expect(PRIVACY_TABLE).toHaveLength(9);
    expect(PRIVACY_TABLE).toEqual(REQ_15_3);
  });

  it('marks the Hotspots row as second release', () => {
    const hotspots = PRIVACY_TABLE.find((row) => row.channel.startsWith('Hotspots'));
    expect(hotspots?.channel).toBe('Hotspots (second release)');
    expect(PRIVACY_TABLE.filter((row) => row.channel.includes('second release'))).toHaveLength(1);
  });

  it('has no empty cell, and no cell with leading or trailing space', () => {
    for (const row of PRIVACY_TABLE) {
      for (const cell of Object.values(row)) {
        expect(cell.length).toBeGreaterThan(0);
        expect(cell).toBe(cell.trim());
      }
    }
  });

  it('is frozen, rows included, so that no screen can change what it says leaves the phone', () => {
    expect(Object.isFrozen(PRIVACY_TABLE)).toBe(true);
    for (const row of PRIVACY_TABLE) expect(Object.isFrozen(row)).toBe(true);
  });
});
