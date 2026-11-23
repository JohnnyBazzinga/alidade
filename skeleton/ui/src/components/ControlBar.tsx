// The controls of a sighting (Req 13.7): each at least 48 × 48 CSS px, 8 px apart, the primary
// ones (Freeze, Capture) at least 64 tall, in the lower part of the screen where a thumb reaches.
// The bar lies in the normal flow, directly after the parts of the screen it belongs to (Req 13.13):
// a bar held at the lower edge of the viewport would lie over the image, the readout or the
// Message that the user needs to read.

import type { ReactNode } from 'react';
import { DOCKED_BAR_TEXT_MAX_SHARE } from '../defaults';
import { Icon, type IconName } from './Icon';
import { BODY_FONT_STACK, COLOURS, ROLE_VARS, SIZES } from './theme';

export interface ControlSpec {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
  /** Freeze, Capture and Start: 64 CSS px tall, brass. */
  readonly primary?: boolean;
  readonly disabled?: boolean;
  /** An icon before the word, chosen by the application (Vigia Req 22.8); the word is the name. */
  readonly icon?: IconName;
}

export function controlStyle(primary: boolean) {
  return {
    boxSizing: 'border-box',
    minWidth: SIZES.touchPx,
    minHeight: primary ? SIZES.primaryPx : SIZES.touchPx,
    height: primary ? SIZES.primaryPx : SIZES.touchPx,
    padding: `0 ${SIZES.gapPx * 2}px`,
    fontFamily: BODY_FONT_STACK,
    fontSize: SIZES.labelPx,
    // Roles and shapes of the theme (Req 22.4, 22.7): in Instrument the primary fill is the flat
    // brass, `ruleStrong` is today's rule and the radius is 0, so the control is as before.
    borderRadius: 'var(--alidade-button-radius)',
    border: `1px solid ${primary ? ROLE_VARS.primary : ROLE_VARS.ruleStrong}`,
    background: primary ? 'var(--alidade-primary-fill)' : ROLE_VARS.raised,
    boxShadow: primary ? 'var(--alidade-shadow)' : 'none',
    color: primary ? ROLE_VARS.primaryInk : ROLE_VARS.ink,
    flex: primary ? '1 1 100%' : '1 1 auto',
  } as const;
}

function Buttons({ controls }: { readonly controls: readonly ControlSpec[] }) {
  return (
    <>
      {controls.map((c) => (
        <button
          key={c.id}
          type="button"
          data-control={c.id}
          data-primary={c.primary === true ? 'true' : 'false'}
          disabled={c.disabled === true}
          onClick={c.onPress}
          style={
            c.icon === undefined
              ? controlStyle(c.primary === true)
              : {
                  ...controlStyle(c.primary === true),
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: SIZES.gapPx,
                }
          }
        >
          {c.icon !== undefined && <Icon name={c.icon} />}
          {c.label}
        </button>
      ))}
    </>
  );
}

/**
 * The docked bar (Req 13.15, design D35): the last row of the screen's column, never a layer. A
 * text part (the north prompt, the portrait warning, the Message of the current refusal) of at
 * most `DOCKED_BAR_TEXT_MAX_SHARE` of the viewport's height, scrolling inside the bar beyond it,
 * over the controls, with the home indicator's inset added to the bottom padding.
 */
export function DockedBar({
  text,
  controls,
}: {
  readonly text: ReactNode;
  readonly controls: readonly ControlSpec[];
}) {
  const hasText = text !== null && text !== undefined && text !== false;
  return (
    <div
      data-testid="control-bar"
      data-placement="docked"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx,
        padding: SIZES.gapPx,
        paddingBottom: `calc(${SIZES.gapPx}px + env(safe-area-inset-bottom))`,
        background: COLOURS.panel,
        borderTop: `1px solid ${COLOURS.rule}`,
      }}
    >
      {hasText && (
        <div
          data-part="bar-text"
          style={{
            maxHeight: `${DOCKED_BAR_TEXT_MAX_SHARE * 100}dvh`,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: SIZES.gapPx,
          }}
        >
          {text}
        </div>
      )}
      {controls.length > 0 && (
        <div
          data-part="bar-controls"
          style={{ display: 'flex', flexWrap: 'wrap', gap: SIZES.gapPx }}
        >
          <Buttons controls={controls} />
        </div>
      )}
    </div>
  );
}

export function ControlBar({ controls }: { readonly controls: readonly ControlSpec[] }) {
  if (controls.length === 0) return null;
  return (
    <div
      data-testid="control-bar"
      data-placement="lower"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: SIZES.gapPx,
        padding: SIZES.gapPx,
        background: COLOURS.panel,
        borderTop: `1px solid ${COLOURS.rule}`,
      }}
    >
      <Buttons controls={controls} />
    </div>
  );
}
