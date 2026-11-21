// A disclosure: a `details` element, closed at first, with a summary that is a control of at least
// 48 px (design D23). The summary says what is inside; what is inside is on the page, so that a
// test and a reader of the markup find it.

import { BODY_FONT_STACK, COLOURS, SIZES } from '@alidade/ui';
import type { ReactNode } from 'react';
import { BODY_TEXT_PX } from './look';

export interface DisclosureProps {
  readonly summary: string;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly testId?: string;
}

export function Disclosure({ summary, children, open = false, testId }: DisclosureProps) {
  return (
    <details
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      open={open}
      style={{ border: `1px solid ${COLOURS.rule}`, background: COLOURS.panel }}
    >
      <summary
        style={{
          minHeight: SIZES.touchPx,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${SIZES.gapPx * 1.5}px`,
          fontFamily: BODY_FONT_STACK,
          fontSize: BODY_TEXT_PX,
          fontWeight: 700,
          color: COLOURS.brass,
          cursor: 'pointer',
        }}
      >
        {summary}
      </summary>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: SIZES.gapPx,
          padding: `${SIZES.gapPx}px ${SIZES.gapPx * 1.5}px ${SIZES.gapPx * 1.5}px`,
        }}
      >
        {children}
      </div>
    </details>
  );
}
