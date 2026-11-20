// The reviewer's path in three numbered lines (task 21.5), on the first screen in Simulation mode
// while the phone in hand has sighted nothing: a judge who opens the page with no explanation
// learns what to do from it.

import { REVIEWER_PATH_TITLE, reviewerPathLines } from '../math/texts';
import { LOOK } from './look';

export function ReviewerPath({ postName }: { readonly postName: string }) {
  return (
    <section data-testid="reviewer-path" style={LOOK.panel}>
      <h2 style={LOOK.title}>{REVIEWER_PATH_TITLE}</h2>
      <ol style={{ ...LOOK.stack, margin: 0, paddingLeft: 28 }}>
        {reviewerPathLines(postName).map((line) => (
          <li key={line} style={LOOK.text}>
            {line}
          </li>
        ))}
      </ol>
    </section>
  );
}
