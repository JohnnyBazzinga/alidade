// Where a further sighting would help most (Req 7.2 to 7.5, design §7.10), in words: with a Fix,
// the two directions from the smoke and how far from it to stand; with one sighting, or a solve
// that failed because the lines do not cross, how far to move sideways. No place is named.

import { useMemo } from 'react';
import { adviceWords, type Advice } from '../math/fix/advice';
import type { VigiaResult } from '../result';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';

export function AdviceView({ advice }: { readonly advice: VigiaResult<Advice> }) {
  const words = useMemo(() => (advice.ok ? adviceWords(advice.value) : advice), [advice]);
  if (!words.ok) return <FailureNotice failure={words} />;
  if (words.value === null) return null;
  return (
    <section data-testid="advice" style={LOOK.panel}>
      <h2 style={LOOK.title}>Where to sight from next</h2>
      <p style={LOOK.text}>{words.value}</p>
    </section>
  );
}
