// A disclosure (design D23), now the UI's (skeleton-ui Req 22.9, D37.8), framed as a card of the
// Field look with its words at 20 and, where given, an icon before them (Req 22.6).

import {
  BODY_FONT_STACK,
  Disclosure as UiDisclosure,
  Icon,
  SIZES,
  type IconName,
} from '@alidade/ui';
import type { ReactNode } from 'react';

export interface DisclosureProps {
  readonly summary: string;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly testId?: string;
  /** An icon before the words (Req 22.6: "Details and limits" `info`, the phone's data `phone`). */
  readonly icon?: IconName;
}

export function Disclosure({ summary, children, open = false, testId, icon }: DisclosureProps) {
  return (
    <UiDisclosure
      summary={
        icon === undefined ? (
          summary
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Icon name={icon} />
            {summary}
          </span>
        )
      }
      open={open}
      framed
      {...(testId === undefined ? {} : { testId })}
      summaryStyle={{
        fontFamily: BODY_FONT_STACK,
        fontSize: SIZES.labelPx,
        fontWeight: 700,
        minHeight: SIZES.touchPx + 8,
      }}
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
