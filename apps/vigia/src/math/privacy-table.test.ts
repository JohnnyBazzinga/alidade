import { describe, expect, it } from 'vitest';
import { HOST_LIST, WIND_ENTRY } from './network/host-list';
import { PRIVACY_TABLE } from './privacy-table';

/** `docs/privacy.md` at the repository root, read as text (task 16.1). */
const PRIVACY_MD = Object.values(
  import.meta.glob<string>('../../../../docs/privacy.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0];

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

// --- docs/privacy.md (task 16.1, Req 15.3, design D20) --------------------------------------------

/** The rows of the first Markdown table of `text`: each line that starts with `|`, minus the header and the rule. */
function markdownRows(text: string): string[][] {
  const lines = text.split('\n').filter((l) => l.trimStart().startsWith('|'));
  return lines
    .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
}

describe('docs/privacy.md (Req 15.3, design D20)', () => {
  it('exists', () => {
    expect(PRIVACY_MD).toBeTypeOf('string');
  });

  const text = PRIVACY_MD ?? '';

  it('has a table whose header names the four columns and whose nine rows equal PRIVACY_TABLE, cell by cell', () => {
    const rows = markdownRows(text);
    expect(rows[0]).toEqual(['Channel', 'What leaves the phone', 'When', 'Who sees it']);
    const body = rows.slice(1);
    expect(body).toHaveLength(PRIVACY_TABLE.length);
    expect(body).toEqual(PRIVACY_TABLE.map((r) => [r.channel, r.whatLeaves, r.when, r.whoSees]));
  });

  it('fails when one cell of the document or of the data is changed (the comparison bites)', () => {
    const changed = text.replace(
      'whoever the user pastes it to',
      'whoever the user pastes it to, or not',
    );
    expect(changed).not.toBe(text);
    const body = markdownRows(changed).slice(1);
    expect(body).not.toEqual(
      PRIVACY_TABLE.map((r) => [r.channel, r.whatLeaves, r.when, r.whoSees]),
    );
  });

  it('has a heading and a paragraph for each row', () => {
    for (const row of PRIVACY_TABLE) {
      const at = text.indexOf(`### ${row.channel}\n`);
      expect(at, row.channel).toBeGreaterThan(0);
      const after = text.slice(at + `### ${row.channel}\n`.length);
      const next = after.search(/^#{1,3} /m);
      const paragraph = (next < 0 ? after : after.slice(0, next)).trim();
      expect(paragraph.length, row.channel).toBeGreaterThan(80);
    }
  });

  it('names no host but the Host list\u2019s and the addresses of their terms', () => {
    const allowed = new Set<string>(HOST_LIST.map((e) => e.host));
    for (const entry of HOST_LIST) allowed.add(new URL(entry.termsUrl).hostname);
    const named = [...text.matchAll(/https?:\/\/([^/\s)`>]+)/g)].map((m) => m[1] ?? '');
    for (const host of named) expect(allowed.has(host), host).toBe(true);
    expect(text).toContain(WIND_ENTRY.host);
  });

  it('says what the code says about the wind: off at start, one rounded point, only on the user\u2019s act', () => {
    const at = text.indexOf('### Wind\n');
    const wind = text.slice(at, text.indexOf('### Tiles\n'));
    expect(wind).toContain('off');
    expect(wind).toContain('0.1');
    expect(wind).toContain('no identifier');
    expect(wind).toMatch(/never[^.]*on a timer/);
  });
});
