// A disclosure (design D23), now the UI's (skeleton-ui Req 22.9, D37.8), framed as Mira's tile: white,
// a light edge, a radius of 16, its words at 14 semibold and, where given, an icon before them.

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
        fontSize: 14,
        fontWeight: 600,
        minHeight: 52,
        padding: '0 16px',
      }}
      bodyStyle={{
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx,
        padding: '4px 16px 16px',
      }}
    >
      {children}
    </UiDisclosure>
  );
}
