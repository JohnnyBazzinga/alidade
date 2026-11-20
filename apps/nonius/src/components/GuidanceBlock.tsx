// How to sight the Sun (Req 4.2): in view before the first sight of a set, then on a card one tap
// away. It is always reachable.

import { LOOK } from './look';

export const GUIDANCE: readonly string[] = [
  'Always look only at the screen, never at the Sun, and never through binoculars or any lens.',
  'Put the crosshair on the centre of the Sun\u2019s glare.',
  'Brace the phone and hold still until the sight is taken.',
  'For all the sights of a set, stay in one place.',
];

const TITLE = 'How to sight the Sun';

export function GuidanceBlock({ collapsed }: { readonly collapsed: boolean }) {
  const sentences = (
    <ul style={{ ...LOOK.stack, margin: 0, paddingLeft: 20 }}>
      {GUIDANCE.map((sentence) => (
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
