// The four tabs (design §9): Smoke, Sightings, Map, Emergency. The App places the bar last in a
// column whose middle scrolls, so it stays under the thumb without a fixed layer over the screen.
//
// Each tab is as wide as its label, and the space left is shared (task 21.1): with four equal
// shares "Sightings" and "Emergency" do not fit 320 CSS px at 16 px of monospace and broke inside
// the word. A label is never wrapped; the Inbox badge sits under the Smoke label, so that it
// widens nothing. `TabBar.test.tsx` checks the arithmetic at 320 px.

import { COLOURS, FONT_STACK, SIZES } from '@alidade/ui';

export type TabId = 'smoke' | 'sightings' | 'map' | 'emergency';

export const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'smoke', label: 'Smoke' },
  { id: 'sightings', label: 'Sightings' },
  { id: 'map', label: 'Map' },
  { id: 'emergency', label: 'Emergency' },
];

export interface TabBarProps {
  readonly current: TabId;
  /** Sightings waiting in the Inbox: a badge on the Smoke tab. */
  readonly inboxCount: number;
  readonly onSelect: (tab: TabId) => void;
}

export function TabBar({ current, inboxCount, onSelect }: TabBarProps) {
  return (
    <nav
      role="tablist"
      data-testid="tab-bar"
      style={{
        display: 'flex',
        borderTop: `1px solid ${COLOURS.rule}`,
        background: COLOURS.panel,
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
              minHeight: SIZES.touchPx + SIZES.gapPx,
              padding: `0 ${SIZES.gapPx / 2}px`,
              fontFamily: FONT_STACK,
              fontSize: 16,
              fontWeight: selected ? 700 : 400,
              border: 'none',
              borderTop: `3px solid ${selected ? COLOURS.brass : COLOURS.panel}`,
              background: COLOURS.panel,
              color: selected ? COLOURS.brass : COLOURS.ink,
              cursor: 'pointer',
            }}
          >
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
                  background: COLOURS.brass,
                  color: COLOURS.brassInk,
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
