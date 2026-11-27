// "What leaves this phone" (Req 15.3, design D20, D26.7), rendered from `PRIVACY_TABLE`. The four
// columns of the requirement's table cannot fit 320 CSS pixels without scrolling sideways, so each
// row is a card that names its cells, as Mira draws it: the channel as the card's title with its
// note in a chip ("Requirement 10", "of the link"), then "What leaves the phone", "When" and "Who
// sees it" in small capitals, each over its text. A round Back and the page's title are above.

import { Icon, NUMERIC_FONT_STACK, ROLE_VARS } from '@alidade/ui';
import { PRIVACY_TABLE } from '../math/privacy-table';
import { useHeader } from './header-context';
import { LOOK } from './look';

/** "Link (Requirement 10)" → the name and the note in the chip. */
function splitChannel(channel: string): { readonly name: string; readonly note: string | null } {
  const open = channel.indexOf(' (');
  if (open < 0 || !channel.endsWith(')')) return { name: channel, note: null };
  return { name: channel.slice(0, open), note: channel.slice(open + 2, -1) };
}

function Cell({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <p style={{ ...LOOK.caption, fontSize: 11 }}>{label}</p>
      <p style={{ ...LOOK.text, fontSize: 14, lineHeight: 1.45 }}>{text}</p>
    </div>
  );
}

export function PrivacyPage({ onBack }: { readonly onBack: () => void }) {
  useHeader(null);
  return (
    <section data-testid="privacy-page" style={LOOK.stack}>
      <div>
        <button type="button" aria-label="Back" onClick={onBack} style={LOOK.roundButton}>
          <Icon name="chevron-left" style={{ width: 16, height: 16 }} />
        </button>
      </div>
      <h1 style={{ ...LOOK.title, fontSize: 30, lineHeight: 1.08, letterSpacing: '-1px' }}>
        What leaves this phone
      </h1>
      <ul style={{ ...LOOK.stack, gap: 10, margin: 0, padding: 0 }}>
        {PRIVACY_TABLE.map((row) => {
          const { name, note } = splitChannel(row.channel);
          return (
            <li
              key={row.channel}
              data-testid="privacy-row"
              aria-label={row.channel}
              style={{ ...LOOK.card, padding: 16, borderRadius: 20, listStyle: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ ...LOOK.cardTitle, fontSize: 18 }}>{name}</h2>
                {note !== null && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      background: ROLE_VARS.raised,
                      color: ROLE_VARS.infoInk,
                      fontFamily: NUMERIC_FONT_STACK,
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.6px',
                    }}
                  >
                    {note}
                  </span>
                )}
              </div>
              <Cell label="What leaves the phone" text={row.whatLeaves} />
              <Cell label="When" text={row.when} />
              <Cell label="Who sees it" text={row.whoSees} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
