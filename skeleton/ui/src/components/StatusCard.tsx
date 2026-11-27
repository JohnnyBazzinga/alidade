// The status card (Req 22.13, design D37.7): how every component draws a status (a Message, the Yaw
// status, a warning). In a theme with `cards` (Field, Field night): the tone's tint, a bar of 4 in
// the tone's bright colour, the tone's icon in its icon colour (3:1), the headline in the tone's ink
// (7:1), bold, at 20, and the rest in ink at 16. In Instrument: today's block, the card's colour
// with a rule of 3 in the alert colour and every line at 20; Instrument's tints are the card's
// colour and its bars the alert colour, so the same roles give it. Every colour is a role.

import type { CSSProperties, ReactNode } from 'react';
import { BODY_FONT_STACK, ROLE_VARS, SIZES } from './theme';
import { useActiveTheme } from './theme/apply-theme';
import type { ThemedRole } from './theme/roles';
import { Icon, type IconName } from './Icon';

export type StatusTone = 'warning' | 'danger' | 'success' | 'info';

/** The icon of each tone (D37.6). */
export const TONE_ICONS: Readonly<Record<StatusTone, IconName>> = {
  warning: 'warning',
  danger: 'danger',
  success: 'success',
  info: 'info',
};

const PREFIX: Readonly<Record<StatusTone, 'warn' | 'danger' | 'ok' | 'info'>> = {
  warning: 'warn',
  danger: 'danger',
  success: 'ok',
  info: 'info',
};

/** The role of a tone's tint, bar, icon or ink. */
export function toneRole(tone: StatusTone, part: 'Tint' | 'Bar' | 'Icon' | 'Ink'): string {
  return ROLE_VARS[`${PREFIX[tone]}${part}` as ThemedRole];
}

/** The instruction's size in a card (Req 13.4: body text). */
export const STATUS_BODY_PX = 16;

export interface StatusCardProps {
  readonly tone: StatusTone;
  /** The first sentence: what happened, or the state. */
  readonly headline: ReactNode;
  /** The rest: what to do. */
  readonly children?: ReactNode;
  /** The tone's icon unless another is named. */
  readonly icon?: IconName;
  readonly role?: 'alert' | 'status';
  readonly testId?: string;
  /** `data-*` attributes of the card, without the prefix. */
  readonly data?: Readonly<Record<string, string>>;
  /** The headline's colour where it is not the tone's ink (a role). */
  readonly headlineColour?: string;
  /** The rest's colour where it is not `ink` (a role). */
  readonly bodyColour?: string;
  /** Extra layout of the card (a line height, a margin); never a colour. */
  readonly style?: CSSProperties;
  /**
   * A card in the docked bar (D37.11): vertical padding 8, no icon column (the icon starts the
   * headline, inline, so that the words wrap under it), and the rest at a line height of 1.25.
   */
  readonly inBar?: boolean;
}

export function StatusCard({
  tone,
  headline,
  children,
  icon,
  role,
  testId,
  data,
  headlineColour,
  bodyColour,
  style,
  inBar = false,
}: StatusCardProps) {
  const theme = useActiveTheme();
  const cards = theme.flags.cards;
  // Mira's card (Req 22.17): the headline extra bold at 15 in ink, the rest at 13 in the tone's ink.
  const mira = theme.flags.dial;
  const attributes = {
    ...(role === undefined ? {} : { role }),
    ...(testId === undefined ? {} : { 'data-testid': testId }),
    ...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v])),
  };
  const headColour = headlineColour ?? toneRole(tone, 'Ink');
  const restColour = bodyColour ?? ROLE_VARS.ink;
  const hasBody = children !== undefined && children !== null && children !== false;
  // A sentence is a paragraph, as it was before Req 22.13; anything else is a block.
  const Body = typeof children === 'string' ? 'p' : 'div';

  if (!cards) {
    // Instrument: today's block (FailureNotice and YawStatusBar before Req 22.13).
    return (
      <div
        {...attributes}
        style={{
          background: toneRole(tone, 'Tint'),
          borderLeft: `3px solid ${toneRole(tone, 'Bar')}`,
          padding: SIZES.gapPx,
          fontFamily: BODY_FONT_STACK,
          fontSize: SIZES.labelPx,
          ...style,
        }}
      >
        <p data-part="headline" style={{ margin: 0, color: headColour }}>
          {headline}
        </p>
        {hasBody && (
          <Body data-part="body" style={{ margin: 0, color: restColour }}>
            {children}
          </Body>
        )}
      </div>
    );
  }

  const iconName = icon ?? TONE_ICONS[tone];
  if (inBar) {
    return (
      <div
        {...attributes}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: toneRole(tone, 'Tint'),
          borderLeft: `4px solid ${toneRole(tone, 'Bar')}`,
          borderRadius: 'var(--alidade-tile-radius, var(--alidade-button-radius))',
          padding: `${SIZES.gapPx}px 12px`,
          fontFamily: BODY_FONT_STACK,
          ...style,
        }}
      >
        <p
          data-part="headline"
          style={{
            margin: 0,
            color: headColour,
            fontWeight: 700,
            fontSize: SIZES.labelPx,
            lineHeight: 1.25,
          }}
        >
          <Icon
            name={iconName}
            style={{
              display: 'inline-block',
              verticalAlign: '-5px',
              marginRight: 6,
              color: toneRole(tone, 'Icon'),
            }}
          />
          {headline}
        </p>
        {hasBody && (
          <Body
            data-part="body"
            style={{ margin: 0, color: restColour, fontSize: STATUS_BODY_PX, lineHeight: 1.25 }}
          >
            {children}
          </Body>
        )}
      </div>
    );
  }

  if (mira) {
    return (
      <div
        {...attributes}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          background: toneRole(tone, 'Tint'),
          borderRadius: 'var(--alidade-tile-radius, var(--alidade-button-radius))',
          padding: '12px 14px',
          fontFamily: BODY_FONT_STACK,
          ...style,
        }}
      >
        <span style={{ display: 'flex', color: ROLE_VARS.ink, paddingTop: 1 }}>
          <Icon name={iconName} style={{ width: 22, height: 22 }} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <p
            data-part="headline"
            style={{
              margin: 0,
              color: ROLE_VARS.ink,
              fontWeight: 800,
              fontSize: 15,
              lineHeight: 1.25,
            }}
          >
            {headline}
          </p>
          {hasBody && (
            <Body
              data-part="body"
              style={{ margin: 0, color: toneRole(tone, 'Ink'), fontSize: 13, lineHeight: 1.45 }}
            >
              {children}
            </Body>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      {...attributes}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: toneRole(tone, 'Tint'),
        borderLeft: `4px solid ${toneRole(tone, 'Bar')}`,
        borderRadius: 'var(--alidade-tile-radius, var(--alidade-button-radius))',
        padding: '12px',
        fontFamily: BODY_FONT_STACK,
        ...style,
      }}
    >
      <span
        style={{
          display: 'flex',
          color: toneRole(tone, 'Icon'),
          // The icon's centre on the headline's first line (20 at a line height of 1.25).
          paddingTop: 1,
        }}
      >
        <Icon name={iconName} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <p
          data-part="headline"
          style={{
            margin: 0,
            color: headColour,
            fontWeight: 700,
            fontSize: SIZES.labelPx,
            lineHeight: 1.25,
          }}
        >
          {headline}
        </p>
        {hasBody && (
          <Body
            data-part="body"
            style={{ margin: 0, color: restColour, fontSize: STATUS_BODY_PX, lineHeight: 1.35 }}
          >
            {children}
          </Body>
        )}
      </div>
    </div>
  );
}
