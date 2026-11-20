// The reviewer's path in three short numbered lines, on the first screen of Simulation mode
// (Req 13.4): what to press, in order.

import { LOOK } from '../look';

export const REVIEWER_PATH: readonly string[] = [
  'Tap Sight the Sun, then Start, Freeze and Capture in the panel.',
  'Tap Done, then Next in the bar above, and sight again.',
  'After the last sight, read the position, then compare it with the true one.',
];

export function ReviewerPath() {
  return (
    <section data-testid="reviewer-path" style={LOOK.panel}>
      <h2 style={LOOK.title}>Try it in three steps</h2>
      <ol style={{ ...LOOK.stack, margin: 0, paddingLeft: 24 }}>
        {REVIEWER_PATH.map((line) => (
          <li key={line} style={LOOK.text}>
            {line}
          </li>
        ))}
      </ol>
    </section>
  );
}
