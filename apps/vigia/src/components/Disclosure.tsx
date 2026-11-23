// A disclosure (design D23), now the UI's (skeleton-ui Req 22.9, D37.8): this file keeps Vigia's
// framed look and its props until task 24.1 moves every caller to the UI's own.

import { BODY_FONT_STACK, Disclosure as UiDisclosure, SIZES } from '@alidade/ui';
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
    <UiDisclosure
      summary={summary}
      open={open}
      framed
      {...(testId === undefined ? {} : { testId })}
      summaryStyle={{ fontFamily: BODY_FONT_STACK, fontSize: BODY_TEXT_PX, fontWeight: 700 }}
      bodyStyle={{
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx,
        padding: `${SIZES.gapPx}px ${SIZES.gapPx * 1.5}px ${SIZES.gapPx * 1.5}px`,
      }}
    >
      {children}
    </UiDisclosure>
  );
}
