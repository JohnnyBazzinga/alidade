// The four tabs (design §9, Req 22.5): Smoke, Sightings, Map, Emergency, each with its icon above
// its label. The App places the bar last in a
// column whose middle scrolls, so it stays under the thumb without a fixed layer over the screen.
//
// Each tab is as wide as its label, and the space left is shared (task 21.1): with four equal
// shares "Sightings" and "Emergency" do not fit 320 CSS px at 16 px of monospace and broke inside
// the word. A label is never wrapped; the Inbox badge sits under the Smoke label, so that it
// widens nothing. `TabBar.test.tsx` checks the arithmetic at 320 px.

import {
  BODY_FONT_STACK,
  Icon,
  ROLE_VARS,
  SIZES,
  useElementSize,
  type IconName,
  type ObserveElementSize,
} from '@alidade/ui';
import { useRef } from 'react';
import { SHAPE } from './look';

export type TabId = 'smoke' | 'sightings' | 'map' | 'emergency';

export const TABS: readonly {
  readonly id: TabId;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { id: 'smoke', label: 'Smoke', icon: 'smoke' },
  { id: 'sightings', label: 'Sightings', icon: 'sightings' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'emergency', label: 'Emergency', icon: 'siren' },
];

/**
 * The labels are at 20 from a bar of this width and at 16 below it (Req 22.5): the four labels at
 * 20 need `349.8` CSS pixels at the `0.63 em` bound with a padding of 2 on each side.
 */
export const LABEL_20_FROM_PX = 360;

export interface TabBarProps {
  readonly current: TabId;
  /** Sightings waiting in the Inbox: a badge on the Smoke tab. */
  readonly inboxCount: number;
  readonly onSelect: (tab: TabId) => void;
  /** How the bar's width is read (the UI's observer; a fake one in tests). */
  readonly observe?: ObserveElementSize;
}

export function TabBar({ current, inboxCount, onSelect, observe }: TabBarProps) {
  const ref = useRef<HTMLElement | null>(null);
  const size = useElementSize(ref, observe);
  // Before the first measure the bar is taken as narrow: a label never starts too large.
  const labelPx = size !== null && size.widthPx >= LABEL_20_FROM_PX ? SIZES.labelPx : 16;
  return (
    <nav
      ref={ref}
      role="tablist"
      data-testid="tab-bar"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        background: ROLE_VARS.tabBar,
        // In a calc, as the docked bar writes it: the simulated DOM keeps env() there.
        paddingBottom: 'calc(0px + env(safe-area-inset-bottom))',
      }}
    >
      {TABS.map((tab) => {
        const selected = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-tab={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              flex: '1 1 auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minWidth: SIZES.touchPx,
              minHeight: SIZES.touchPx + SIZES.gapPx * 2,
              padding: '4px 2px 6px',
              fontFamily: BODY_FONT_STACK,
              fontSize: labelPx,
              lineHeight: 1.2,
              fontWeight: selected ? 700 : 400,
              border: 'none',
              borderTop: `4px solid ${selected ? ROLE_VARS.tabActive : ROLE_VARS.tabBar}`,
              background: ROLE_VARS.tabBar,
              color: selected ? ROLE_VARS.tabActive : ROLE_VARS.tabInk,
              cursor: 'pointer',
            }}
          >
            <Icon name={tab.icon} />
            <span data-part="tab-label" style={{ whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
            {tab.id === 'smoke' && inboxCount > 0 && (
              <span
                data-testid="inbox-badge"
                aria-label={`${inboxCount} waiting`}
                style={{
                  padding: '0 6px',
                  lineHeight: 1.2,
                  borderRadius: SHAPE.badgeRadius,
                  background: ROLE_VARS.primary,
                  color: ROLE_VARS.primaryInk,
                  fontWeight: 700,
                }}
              >
                {inboxCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
