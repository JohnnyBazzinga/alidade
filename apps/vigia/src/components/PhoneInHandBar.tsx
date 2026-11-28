// Which simulated phone is in hand (task 21.5; Req 17.5, design §10). In Simulation mode one phone
// is held for each post of the scene; this bar, under the banner on every screen, says which one
// the screens are of and changes it. The Simulation shell owns the choice and hands it to the
// Simulator panel, so that the next sighting is taken from the post named here.

import { BODY_FONT_STACK, COLOURS, ROLE_VARS, SIZES } from '@alidade/ui';
import { BODY_TEXT_PX, LOOK } from './look';

export interface PhoneInHand {
  /** The post (the scene's Station) of the phone in hand. */
  readonly stationId: string;
  /** The posts of the scene, in its order, each a phone. */
  readonly stations: readonly { readonly id: string; readonly name: string }[];
  readonly onSelect: (stationId: string) => void;
  /**
   * The reviewer's step, worked out from every phone's state (`reviewerStep`; Req 17.7): under the
   * post, on every screen, so that the path is never out of sight (2026-11-28, both reviewers).
   */
  readonly step?: string;
  /**
   * The next post to sight from: this one while its phone has no sighting of its own, else another
   * post whose phone has none; `null` when every phone has one (then sending is the next step);
   * left out when the shell does not say.
   */
  readonly nextPost?: { readonly id: string; readonly name: string } | null;
}

export const PHONE_IN_HAND_LABEL = 'You hold the phone at';

export function PhoneInHandBar({ hand }: { readonly hand: PhoneInHand }) {
  return (
    <div
      data-testid="phone-in-hand"
      style={{
        padding: `${SIZES.gapPx / 2}px ${SIZES.gapPx * 1.5}px`,
        background: COLOURS.panel,
        borderBottom: `1px solid ${COLOURS.rule}`,
      }}
    >
      <label
        style={{
          ...LOOK.text,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: SIZES.gapPx,
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{PHONE_IN_HAND_LABEL}</span>
        <select
          value={hand.stationId}
          onChange={(e) => hand.onSelect(e.target.value)}
          style={{
            flex: '1 1 auto',
            boxSizing: 'border-box',
            minHeight: SIZES.touchPx,
            minWidth: SIZES.touchPx,
            fontFamily: BODY_FONT_STACK,
            // 16 px, so that the label and the post share one row at 390 CSS px (task 30.4).
            fontSize: BODY_TEXT_PX,
            fontWeight: 700,
            background: COLOURS.raised,
            color: COLOURS.ink,
            border: `1px solid ${COLOURS.brass}`,
            borderRadius: 0,
          }}
        >
          {hand.stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {hand.step !== undefined && hand.step !== '' && (
        <p
          data-testid="reviewer-step"
          role="status"
          style={{
            ...LOOK.caption,
            margin: `${SIZES.gapPx / 2}px 0 0`,
            color: ROLE_VARS.ink,
            textTransform: 'none',
            letterSpacing: '0.2px',
            fontSize: 13,
          }}
        >
          {hand.step}
        </p>
      )}
    </div>
  );
}
