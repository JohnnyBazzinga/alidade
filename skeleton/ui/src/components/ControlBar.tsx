// The controls of a sighting (Req 13.7): each at least 48 × 48 CSS px, 8 px apart, the primary
// ones (Freeze, Capture) at least 64 tall, in the lower part of the screen where a thumb reaches.
// The bar lies in the normal flow, directly after the parts of the screen it belongs to (Req 13.13):
// a bar held at the lower edge of the viewport would lie over the image, the readout or the
// Message that the user needs to read.

import type { CSSProperties, ReactNode } from 'react';
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

function ControlButton({
  control: c,
  style,
  iconStyle,
}: {
  readonly control: ControlSpec;
  readonly style?: CSSProperties;
  readonly iconStyle?: CSSProperties;
}) {
  return (
    <button
      type="button"
      data-control={c.id}
      data-primary={c.primary === true ? 'true' : 'false'}
      disabled={c.disabled === true}
      onClick={c.onPress}
      style={{
        ...controlStyle(c.primary === true),
        ...(c.icon === undefined
          ? {}
          : {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SIZES.gapPx,
            }),
        ...style,
      }}
    >
      {c.icon !== undefined && (
        <Icon name={c.icon} {...(iconStyle === undefined ? {} : { style: iconStyle })} />
      )}
      {c.label}
    </button>
  );
}

function Buttons({ controls }: { readonly controls: readonly ControlSpec[] }) {
  return (
    <>
      {controls.map((c) => (
        <ControlButton key={c.id} control={c} />
      ))}
    </>
  );
}

/**
 * The way out of the screen at the start of the bar's first row (Vigia: Back, task 36): as wide as
 * its words and its icon, and as tall as the action beside it, so that the action keeps the rest of
 * the row (about four fifths at 390 CSS px).
 */
export function backStyle(heightPx: number): CSSProperties {
  return {
    flex: '0 0 auto',
    height: 'auto',
    minHeight: heightPx,
    padding: `0 ${SIZES.gapPx * 1.25}px 0 ${SIZES.gapPx}px`,
    gap: 0,
  };
}

/**
 * The chevron's own box is 24 wide and its stroke spans the middle 6 (lucide's `chevron-left`):
 * pulled in on both sides, so that Back is about a fifth of the row at 390 (the lead's "tipo 20%").
 */
export const BACK_ICON_STYLE: CSSProperties = { marginLeft: -6, marginRight: -3 };

/**
 * The action beside Back: the rest of the row, at least as tall as its kind, and taller when its
 * words need a third line (at 320 CSS px "Set north from the compass" may: the row grows and the
 * image, which flexes, gives the height; at 375 and 390 they take two lines, as the budget counts).
 */
export function besideBackStyle(heightPx: number): CSSProperties {
  return {
    flex: '1 1 0',
    height: 'auto',
    minHeight: heightPx,
    padding: `${SIZES.gapPx / 2}px ${SIZES.gapPx * 1.5}px`,
    lineHeight: 1.2,
  };
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
  back,
}: {
  readonly text: ReactNode;
  readonly controls: readonly ControlSpec[];
  /** The way out, first in the first row, beside the current action (task 36). */
  readonly back?: ControlSpec;
}) {
  const hasText = text !== null && text !== undefined && text !== false;
  const [first, ...rest] = controls;
  const rowPx = first?.primary === true ? SIZES.primaryPx : SIZES.touchPx;
  const row = { display: 'flex', flexWrap: 'wrap', gap: SIZES.gapPx } as const;
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
      {back === undefined && controls.length > 0 && (
        <div data-part="bar-controls" style={row}>
          <Buttons controls={controls} />
        </div>
      )}
      {back !== undefined && (
        <div
          data-part="bar-controls"
          style={{ display: 'flex', flexDirection: 'column', gap: SIZES.gapPx }}
        >
          <div data-part="bar-row" style={{ ...row, flexWrap: 'nowrap' }}>
            <ControlButton control={back} style={backStyle(rowPx)} iconStyle={BACK_ICON_STYLE} />
            {first !== undefined && (
              <ControlButton control={first} style={besideBackStyle(rowPx)} />
            )}
          </div>
          {rest.length > 0 && (
            <div data-part="bar-row" style={row}>
              <Buttons controls={rest} />
            </div>
          )}
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
