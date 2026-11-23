// One Sighting in the list (design §9; Req 3.6, 5.1, 5.2, 5.6, 15.5): where it came from, its
// direction with its 1-sigma, its position accuracy, its time and age, whether it is used or set
// aside and why (the Message of its cause), and the channels it was shared by from this phone.
// Hide and Show act at once (they can be undone); Delete asks once, in the row.

import { useState } from 'react';
import type { SetAsideCause } from '../math/assessment/assess';
import { ageText, clockTextUtc } from '../math/civil-time';
import { accuracyText, directionText } from '../math/fix/format';
import type { ShareChannel, SightingEntry } from '../math/incident/incident-state';
import { messageFor } from '../math/messages';
import { FailureNotice } from './FailureNotice';
import { Icon, ROLE_VARS, SIZES } from '@alidade/ui';
import { IconRow, InlineIcon } from './cards/parts';
import { LOOK } from './look';

const CHANNEL_WORDS: Readonly<Record<ShareChannel, string>> = {
  link: 'link',
  qr: 'QR code',
  text: 'text code',
  system_share: 'share sheet',
  memory: 'sending to another simulated phone',
};

export interface SightingRowProps {
  readonly number: number;
  readonly entry: SightingEntry;
  /** `null` when the Sighting is used. */
  readonly cause: SetAsideCause | null;
  readonly nowUtcMs: number;
  readonly onHide: () => void;
  readonly onShow: () => void;
  readonly onShare: () => void;
  readonly onDelete: () => void;
}

export function SightingRow(props: SightingRowProps) {
  const { number, entry, cause, nowUtcMs } = props;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { sighting } = entry;
  const bearing = sighting.bearing;
  const direction = directionText(bearing.azimuthRad, bearing.azimuthSigmaRad);
  const accuracy = accuracyText(bearing.positionAccuracyM);
  const origin =
    sighting.origin === 'local' || sighting.receivedUtcMs === null
      ? 'this phone'
      : `received at ${clockTextUtc(sighting.receivedUtcMs)}`;
  const channels = [...new Set(entry.shared.map((r) => CHANNEL_WORDS[r.channel]))];
  const message = cause === null ? null : messageFor({ ok: false, reason: cause });
  // A card (Req 22.7, design D25.2, D25.5): a head row tinted `raised` with its icon and title; the
  // bearing at 32 in the numeric stack, with its ± and no icon beside it, and its North words on the
  // line under it after the navigation icon; icon rows for the accuracy and the time; the status as
  // a badge (Used) or a warning card (set aside); the share state; the actions with their icons.
  return (
    <li
      data-testid="sighting-row"
      data-sighting-id={sighting.sightingId}
      data-used={cause === null ? 'true' : 'false'}
      style={{ ...LOOK.card, padding: 0, gap: 0, overflow: 'hidden', listStyle: 'none' }}
    >
      <div
        data-part="head"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: ROLE_VARS.raised,
          borderBottom: `1px solid ${ROLE_VARS.rule}`,
        }}
      >
        <Icon name="crosshair" style={{ color: ROLE_VARS.accent }} />
        <h3
          style={{ ...LOOK.title, fontSize: SIZES.labelPx }}
        >{`Sighting ${number}, ${origin}`}</h3>
      </div>
      <div style={{ ...LOOK.stack, gap: SIZES.gapPx, padding: '12px 16px 16px' }}>
        {direction.ok ? (
          <p
            data-part="bearing"
            style={{ ...LOOK.text, display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <span style={LOOK.dim}>Toward</span>{' '}
            <span data-part="numeral" style={{ ...LOOK.numeral, whiteSpace: 'nowrap' }}>
              {direction.value}
            </span>{' '}
            <span
              style={{
                ...LOOK.text,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: ROLE_VARS.inkDim,
              }}
            >
              <Icon name="navigation" style={{ color: ROLE_VARS.accent }} />
              (true north)
            </span>
          </p>
        ) : (
          <FailureNotice failure={direction} />
        )}
        {accuracy.ok ? (
          <IconRow icon="pin" tilePx={32}>
            <p style={LOOK.text}>Observer position known to {accuracy.value}</p>
          </IconRow>
        ) : (
          <FailureNotice failure={accuracy} />
        )}
        <IconRow icon="clock" tilePx={32}>
          <p style={LOOK.text}>
            Taken {clockTextUtc(bearing.timeUtcMs)}, {ageText(nowUtcMs - bearing.timeUtcMs)}
          </p>
        </IconRow>
        {message === null ? (
          <p data-part="badge" style={LOOK.badge('success')}>
            <Icon name="success" style={{ color: ROLE_VARS.okIcon }} />
            Used
          </p>
        ) : (
          <div data-part="set-aside" style={LOOK.statusCard('warning')}>
            <p style={{ ...LOOK.text, color: ROLE_VARS.warnInk }}>
              <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
              Set aside: {message.whatHappened} {message.whatToDo}
            </p>
          </div>
        )}
        <p style={LOOK.dim}>
          {channels.length === 0
            ? 'Not shared from this phone'
            : `Shared by ${channels.join(', ')}`}
        </p>
        {confirmingDelete ? (
          <div role="group" style={LOOK.statusCard('danger')}>
            <p style={{ ...LOOK.alertText, color: ROLE_VARS.dangerInk }}>
              <InlineIcon name="danger" colour={ROLE_VARS.dangerIcon} />
              Delete this sighting from this phone? This cannot be undone.
            </p>
            <div style={LOOK.controls}>
              <button type="button" onClick={props.onDelete} style={LOOK.dangerButton}>
                <Icon name="trash" />
                Delete this sighting
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} style={LOOK.button}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div data-part="actions" style={LOOK.controls}>
            {entry.hidden ? (
              <button
                type="button"
                onClick={props.onShow}
                style={{ ...LOOK.button, flex: '1 1 auto' }}
              >
                <Icon name="show" />
                Show
              </button>
            ) : (
              <button
                type="button"
                onClick={props.onHide}
                style={{ ...LOOK.button, flex: '1 1 auto' }}
              >
                <Icon name="hide" />
                Hide
              </button>
            )}
            <button
              type="button"
              onClick={props.onShare}
              style={{ ...LOOK.button, flex: '1 1 auto' }}
            >
              <Icon name="share" />
              Share
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              style={{ ...LOOK.dangerButton, flex: '1 1 auto' }}
            >
              <Icon name="trash" />
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
