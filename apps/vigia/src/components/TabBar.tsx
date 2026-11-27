// The four tabs (design §9, Req 22.5 as amended 2026-11-27): Smoke, Sightings, Map, Emergency,
// each with its icon above its label, in Mira's bar: a dark pill of 62 that floats 16 from the
// sides, the current tab in the yellow. The App places the bar last in a column whose middle
// scrolls, so it stays under the thumb without a fixed layer over the screen.
//
// The four labels share the bar in equal parts; at Mira's 11 each fits a quarter of the bar from
// 320 CSS px wide (the longest, "Emergency", is about 70 wide). A label is never wrapped; the Inbox
// badge sits beside the Smoke icon, so that it widens nothing.
import {
  BODY_FONT_STACK,
  Icon,
  ROLE_VARS,
  type IconName,
  type ObserveElementSize,
} from '@alidade/ui';
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

/** The labels' size (Mira: 11). */
export const TAB_LABEL_PX = 11;
/** The bar's height and its margins (Mira: 62, 12 above, 16 at the sides, 14 below). */
export const TAB_BAR = { heightPx: 62, topPx: 12, sidePx: 16, bottomPx: 14 } as const;

export interface TabBarProps {
  readonly current: TabId;
  /** Sightings waiting in the Inbox: a badge on the Smoke tab. */
  readonly inboxCount: number;
  readonly onSelect: (tab: TabId) => void;
  /** How the bar's width is read (the UI's observer; a fake one in tests). */
  readonly observe?: ObserveElementSize;
}

export function TabBar({ current, inboxCount, onSelect }: TabBarProps) {
  return (
    <nav
      role="tablist"
      data-testid="tab-bar"
      style={{
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        minHeight: TAB_BAR.heightPx,
        margin: `${TAB_BAR.topPx}px ${TAB_BAR.sidePx}px calc(${TAB_BAR.bottomPx}px + env(safe-area-inset-bottom))`,
        borderRadius: TAB_BAR.heightPx / 2,
        background: ROLE_VARS.tabBar,
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
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              minWidth: 44,
              minHeight: TAB_BAR.heightPx,
              padding: '6px 2px',
              fontFamily: BODY_FONT_STACK,
              fontSize: TAB_LABEL_PX,
              lineHeight: 1.2,
              fontWeight: selected ? 600 : 400,
              border: 'none',
              borderRadius: TAB_BAR.heightPx / 2,
              background: 'transparent',
              color: selected ? ROLE_VARS.tabActive : ROLE_VARS.tabInk,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={tab.icon} style={{ width: 22, height: 22 }} />
              {tab.id === 'smoke' && inboxCount > 0 && (
                <span
                  data-testid="inbox-badge"
                  aria-label={`${inboxCount} waiting`}
                  style={{
                    minWidth: 18,
                    padding: '0 5px',
                    boxSizing: 'border-box',
                    lineHeight: '18px',
                    borderRadius: SHAPE.badgeRadius,
                    background: ROLE_VARS.primary,
                    color: ROLE_VARS.primaryInk,
                    fontSize: 11,
                    fontWeight: 800,
                    textAlign: 'center',
                  }}
                >
                  {inboxCount}
                </span>
              )}
            </span>
            <span data-part="tab-label" style={{ whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
