// How to sight smoke (Req 3.7, 16.2): in view before the first capture of a session, then on a
// card one tap away.

import { sightingGuidance } from '../math/texts';
import { LOOK } from './look';

export interface GuidanceBlockProps {
  /** After the first capture of the session: the sentences fold behind one tap. */
  readonly collapsed: boolean;
  /** A wind reading is shown: the smoke leans downwind (Req 13.5). */
  readonly windShown: boolean;
}

const TITLE = 'How to aim at smoke';

export function GuidanceBlock({ collapsed, windShown }: GuidanceBlockProps) {
  const sentences = (
    <ul style={{ ...LOOK.stack, margin: 0, paddingLeft: 20 }}>
      {sightingGuidance(windShown).map((sentence) => (
        <li key={sentence} style={LOOK.text}>
          {sentence}
        </li>
      ))}
    </ul>
  );
  return (
    <section data-testid="guidance" style={LOOK.panel}>
      {collapsed ? (
        <details>
          <summary style={{ ...LOOK.text, minHeight: 48, display: 'flex', alignItems: 'center' }}>
            {TITLE}
          </summary>
          {sentences}
        </details>
      ) : (
        <>
          <h2 style={LOOK.title}>{TITLE}</h2>
          {sentences}
        </>
      )}
    </section>
  );
}
