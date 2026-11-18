// The controls of a sighting (Req 13.7): each at least 48 × 48 CSS px, 8 px apart, the primary
// ones (Freeze, Capture) at least 64 tall, in the lower part of the screen where a thumb reaches.

import { COLOURS, FONT_STACK, SIZES } from './theme';

export interface ControlSpec {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
  /** Freeze, Capture and Start: 64 CSS px tall, brass. */
  readonly primary?: boolean;
  readonly disabled?: boolean;
}

export function controlStyle(primary: boolean) {
  return {
    boxSizing: 'border-box',
    minWidth: SIZES.touchPx,
    minHeight: primary ? SIZES.primaryPx : SIZES.touchPx,
    height: primary ? SIZES.primaryPx : SIZES.touchPx,
    padding: `0 ${SIZES.gapPx * 2}px`,
    fontFamily: FONT_STACK,
    fontSize: SIZES.labelPx,
    borderRadius: 0,
    border: `1px solid ${primary ? COLOURS.brass : COLOURS.rule}`,
    background: primary ? COLOURS.brass : COLOURS.raised,
    color: primary ? COLOURS.brassInk : COLOURS.ink,
    flex: primary ? '1 1 100%' : '1 1 auto',
  } as const;
}

export function ControlBar({ controls }: { readonly controls: readonly ControlSpec[] }) {
  if (controls.length === 0) return null;
  return (
    <div
      data-testid="control-bar"
      data-placement="lower"
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: SIZES.gapPx,
        padding: SIZES.gapPx,
        background: COLOURS.panel,
        borderTop: `1px solid ${COLOURS.rule}`,
      }}
    >
      {controls.map((c) => (
        <button
          key={c.id}
          type="button"
          data-control={c.id}
          data-primary={c.primary === true ? 'true' : 'false'}
          disabled={c.disabled === true}
          onClick={c.onPress}
          style={controlStyle(c.primary === true)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
