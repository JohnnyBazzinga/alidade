// The tab bar (design §9; Nonius Req 16.3): Fix, Sights and Map, drawn as Mira draws it, a dark
// pill floating above the foot of the screen, each tab an icon above its word, the current one in
// the yellow. Shown on the three tabs only.
import { BODY_FONT_STACK, Icon, ROLE_VARS, type IconName } from '@alidade/ui';

export type TabId = 'fix' | 'sights' | 'map';

export const TABS: readonly {
  readonly id: TabId;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { id: 'fix', label: 'Fix', icon: 'crosshair' },
  { id: 'sights', label: 'Sights', icon: 'sightings' },
  { id: 'map', label: 'Map', icon: 'map' },
];

/** The labels' size (Mira: 11). */
export const TAB_LABEL_PX = 11;

/** The bar's height and its margins (Mira: 62, 12 above, 16 at the sides, 14 below). */
export const TAB_BAR = { heightPx: 62, topPx: 12, sidePx: 16, bottomPx: 14 } as const;

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
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
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
            <Icon name={tab.icon} style={{ width: 22, height: 22 }} />
            <span data-part="tab-label" style={{ whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
