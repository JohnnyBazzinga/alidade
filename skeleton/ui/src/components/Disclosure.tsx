// A disclosure (Req 22.9, design D37.8): a `details` element, closed unless asked, whose summary is
// a row of at least 48 with its label and a chevron that says its state: down while closed, up
// while open (read from the `toggle` event; the DOM keeps `open`). A row laid out as `flex` loses
// the browser's marker, so the row draws its own. What is inside is on the page, so that a test
// and a reader of the markup find it. A row that opens another view is not a disclosure: it ends
// in a chevron-right (an application's navigation row).

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';
import { ROLE_VARS, SIZES } from './theme';

export interface DisclosureProps {
  readonly summary: ReactNode;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly testId?: string;
  /** The `data-part` of the `details`. */
  readonly part?: string;
  /** A bordered card of the theme's card colour, for a disclosure among cards. */
  readonly framed?: boolean;
  /** Layout of the `details` (a margin, a padding); never a colour. */
  readonly style?: CSSProperties;
  /** The summary's text style (its font, its size, its weight, its colour as a role). */
  readonly summaryStyle?: CSSProperties;
  /** When given, the contents are wrapped in a block of this style; else they follow the summary. */
  readonly bodyStyle?: CSSProperties;
}

export function Disclosure({
  summary,
  children,
  open = false,
  testId,
  part,
  framed = false,
  style,
  summaryStyle,
  bodyStyle,
}: DisclosureProps) {
  const [isOpen, setOpen] = useState(open);
  return (
    <details
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      {...(part === undefined ? {} : { 'data-part': part })}
      open={isOpen}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      style={{
        ...(framed
          ? {
              border: `1px solid ${ROLE_VARS.rule}`,
              background: ROLE_VARS.card,
              borderRadius: 'var(--alidade-tile-radius, var(--alidade-button-radius))',
            }
          : {}),
        ...style,
      }}
    >
      <summary
        style={{
          minHeight: SIZES.touchPx,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SIZES.gapPx,
          listStyle: 'none',
          color: ROLE_VARS.accent,
          cursor: 'pointer',
          ...(framed ? { padding: `0 ${SIZES.gapPx * 1.5}px` } : {}),
          ...summaryStyle,
        }}
      >
        <span>{summary}</span>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} />
      </summary>
      {bodyStyle === undefined ? children : <div style={bodyStyle}>{children}</div>}
    </details>
  );
}
