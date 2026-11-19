// "What leaves this phone" (Req 15.3, design D20), rendered from `PRIVACY_TABLE`. The four
// columns of the requirement's table cannot fit 320 CSS pixels without scrolling sideways, so
// each row is a block that names its four cells.

import { PRIVACY_TABLE } from '../math/privacy-table';
import { LOOK } from './look';

export function PrivacyPage({ onBack }: { readonly onBack: () => void }) {
  return (
    <section data-testid="privacy-page" style={LOOK.stack}>
      <div style={LOOK.controls}>
        <button type="button" onClick={onBack} style={LOOK.button}>
          Back
        </button>
      </div>
      <h1 style={LOOK.title}>What leaves this phone</h1>
      <ul style={{ ...LOOK.stack, margin: 0, padding: 0 }}>
        {PRIVACY_TABLE.map((row) => (
          <li
            key={row.channel}
            data-testid="privacy-row"
            style={{ ...LOOK.panel, listStyle: 'none' }}
          >
            <h2 style={LOOK.title}>{row.channel}</h2>
            <p style={LOOK.text}>What leaves the phone: {row.whatLeaves}</p>
            <p style={LOOK.text}>When: {row.when}</p>
            <p style={LOOK.text}>Who sees it: {row.whoSees}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
