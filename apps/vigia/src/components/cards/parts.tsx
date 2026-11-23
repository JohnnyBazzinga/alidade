// The parts of the Field look's cards (Req 22.6, 22.11, design D25.2, D25.5): an icon at the start
// of a sentence, a row of words with a round tint behind its icon, and a row that opens another
// view, which ends in a chevron-right. An icon is always beside the words that say the same.

import { Icon, ROLE_VARS, SIZES, type IconName } from '@alidade/ui';
import type { CSSProperties, ReactNode } from 'react';
import { LOOK } from '../look';

/** An icon that starts a sentence, inline, so that the words wrap under it (D25.2). */
export function InlineIcon({ name, colour }: { readonly name: IconName; readonly colour: string }) {
  return (
    <Icon
      name={name}
      style={{ display: 'inline-block', verticalAlign: '-5px', marginRight: 8, color: colour }}
    />
  );
}

/** A fact: a round tint with its icon, then its words (Req 22.6: supporting facts as rows). */
export function IconRow({
  icon,
  children,
  testId,
  style,
  tilePx = 40,
}: {
  readonly icon: IconName;
  readonly children: ReactNode;
  readonly testId?: string;
  readonly style?: CSSProperties;
  /** The round tint's side: 40, or 32 in a compact card. */
  readonly tilePx?: number;
}) {
  return (
    <div
      data-part="icon-row"
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      style={{ display: 'flex', alignItems: 'center', gap: SIZES.gapPx * 1.5, ...style }}
    >
      <span style={{ ...LOOK.iconTile, width: tilePx, height: tilePx }}>
        <Icon name={icon} />
      </span>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** A row that opens another view (Req 22.11): its icon, its words, a chevron-right at the end. */
export function NavRow({
  icon,
  children,
  onClick,
}: {
  readonly icon: IconName;
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" data-part="nav-row" onClick={onClick} style={LOOK.row}>
      <span style={{ ...LOOK.iconTile, width: 36, height: 36 }}>
        <Icon name={icon} />
      </span>
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>{children}</span>
      <Icon name="chevron-right" style={{ color: ROLE_VARS.inkDim }} />
    </button>
  );
}

/**
 * A statement whose first sentence is its headline (D25.2): the first sentence bold, a space, the
 * rest in the same colour, not bold. The text is the statement's, word for word.
 */
export function HeadlineFirst({ text }: { readonly text: string }) {
  const end = text.indexOf('. ');
  if (end < 0) return <strong>{text}</strong>;
  return (
    <>
      <strong>{text.slice(0, end + 1)}</strong> {text.slice(end + 2)}
    </>
  );
}
