// The three tabs (design §9): Fix, Sights, Map. The App places the bar last in a column whose
// middle scrolls, so it stays under the thumb without a fixed layer over the screen.
//
// Each tab is as wide as its label, and the space left is shared; a label is never wrapped.
// `TabBar.test.tsx` checks the arithmetic at 320 px.

import { BODY_FONT_STACK, COLOURS, SIZES } from '@alidade/ui';

export type TabId = 'fix' | 'sights' | 'map';

export const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'fix', label: 'Fix' },
  { id: 'sights', label: 'Sights' },
  { id: 'map', label: 'Map' },
];

export interface TabBarProps {
  readonly current: TabId;
  readonly onSelect: (tab: TabId) => void;
}

export function TabBar({ current, onSelect }: TabBarProps) {
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
              minWidth: SIZES.touchPx,
              minHeight: SIZES.touchPx + SIZES.gapPx,
              padding: `0 ${SIZES.gapPx / 2}px`,
              fontFamily: BODY_FONT_STACK,
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
          </button>
        );
      })}
    </nav>
  );
}
