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
import { Icon, ROLE_VARS } from '@alidade/ui';
import { BearingDial } from './art/Dials';
import { InlineIcon } from './cards/parts';
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
  // Mira's card (design D26.5): its title and the Used badge on one row; the bearing dial beside
  // "Toward", the numeral at 44 and its 1-sigma and north in small capitals; icon rows for the
  // accuracy, the time and the share state over a rule; a set-aside sighting's warning card; the
  // three actions as pills of equal width, Delete in the danger tone.
  // "33.4° ± 2.1°": the numeral, and its 1-sigma in the caption under it.
  const [numeral = '', sigma = ''] = direction.ok ? direction.value.split(' ± ') : [];
  const row = { display: 'flex', alignItems: 'center', gap: 10 } as const;
  const rowIcon = { width: 18, height: 18, color: ROLE_VARS.inkDim } as const;
  const pillAction = { ...LOOK.button, minHeight: 50, padding: '0 8px', gap: 8 } as const;
  return (
    <li
      data-testid="sighting-row"
      data-sighting-id={sighting.sightingId}
      data-used={cause === null ? 'true' : 'false'}
      style={{ ...LOOK.card, gap: 14, listStyle: 'none' }}
    >
      <div
        data-part="head"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <h3 style={{ ...LOOK.cardTitle, fontSize: 17, letterSpacing: '-0.3px' }}>
          {`Sighting ${number}, ${origin}`}
        </h3>
        {message === null && (
          <p data-part="badge" style={{ ...LOOK.badge('success'), alignSelf: 'center' }}>
            <Icon name="check" style={{ width: 12, height: 12, color: ROLE_VARS.okInk }} />
            Used
          </p>
        )}
      </div>
      {direction.ok ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BearingDial
            azimuthRad={bearing.azimuthRad}
            sizePx={104}
            face={false}
            label={`Compass dial pointing toward ${numeral.replace('°', '')} degrees`}
          />
          <p
            data-part="bearing"
            aria-label={`Toward ${direction.value} (true north)`}
            style={{ ...LOOK.text, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
          >
            <span style={LOOK.caption}>Toward</span>
            <span data-part="numeral" style={{ ...LOOK.numeral, whiteSpace: 'nowrap' }}>
              {numeral}
            </span>
            <span style={{ ...LOOK.caption, fontSize: 13 }}>{`± ${sigma} · true north`}</span>
          </p>
        </div>
      ) : (
        <FailureNotice failure={direction} />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingTop: 12,
          borderTop: `1px solid ${ROLE_VARS.rule}`,
        }}
      >
        {accuracy.ok ? (
          <p style={{ ...LOOK.text, fontSize: 14, ...row }}>
            <Icon name="pin" style={rowIcon} />
            Observer position known to {accuracy.value}
          </p>
        ) : (
          <FailureNotice failure={accuracy} />
        )}
        <p style={{ ...LOOK.text, fontSize: 14, ...row }}>
          <Icon name="clock" style={rowIcon} />
          Taken {clockTextUtc(bearing.timeUtcMs)}, {ageText(nowUtcMs - bearing.timeUtcMs)}
        </p>
        <p style={{ ...LOOK.text, fontSize: 14, ...row }}>
          <Icon name="share" style={rowIcon} />
          {channels.length === 0
            ? 'Not shared from this phone'
            : `Shared by ${channels.join(', ')}`}
        </p>
      </div>
      {message !== null && (
        <div data-part="set-aside" style={LOOK.statusCard('warning')}>
          <p style={{ ...LOOK.text, color: ROLE_VARS.warnInk }}>
            <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
            Set aside: {message.whatHappened} {message.whatToDo}
          </p>
        </div>
      )}
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
        <div
          data-part="actions"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}
        >
          <button type="button" onClick={props.onShare} style={pillAction}>
            Share
          </button>
          {entry.hidden ? (
            <button type="button" onClick={props.onShow} style={pillAction}>
              Show
            </button>
          ) : (
            <button type="button" onClick={props.onHide} style={pillAction}>
              Hide
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            style={{ ...LOOK.dangerButton, minHeight: 50, padding: '0 8px' }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
