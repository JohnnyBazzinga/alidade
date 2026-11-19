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
  return (
    <li
      data-testid="sighting-row"
      data-sighting-id={sighting.sightingId}
      data-used={cause === null ? 'true' : 'false'}
      style={{ ...LOOK.panel, listStyle: 'none' }}
    >
      <h3 style={LOOK.title}>{`Sighting ${number}, ${origin}`}</h3>
      {direction.ok ? (
        <p style={LOOK.readout}>Toward {direction.value} (true north)</p>
      ) : (
        <FailureNotice failure={direction} />
      )}
      {accuracy.ok ? (
        <p style={LOOK.text}>Observer position known to {accuracy.value}</p>
      ) : (
        <FailureNotice failure={accuracy} />
      )}
      <p style={LOOK.text}>
        Taken {clockTextUtc(bearing.timeUtcMs)}, {ageText(nowUtcMs - bearing.timeUtcMs)}
      </p>
      {message === null ? (
        <p style={{ ...LOOK.text, fontWeight: 700 }}>Used</p>
      ) : (
        <p style={{ ...LOOK.text, color: LOOK.alertText.color }}>
          Set aside: {message.whatHappened} {message.whatToDo}
        </p>
      )}
      <p style={LOOK.dim}>
        {channels.length === 0 ? 'Not shared from this phone' : `Shared by ${channels.join(', ')}`}
      </p>
      {confirmingDelete ? (
        <div role="group" style={LOOK.alertPanel}>
          <p style={LOOK.alertText}>Delete this sighting from this phone? This cannot be undone.</p>
          <div style={LOOK.controls}>
            <button type="button" onClick={props.onDelete} style={LOOK.dangerButton}>
              Delete this sighting
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} style={LOOK.button}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div style={LOOK.controls}>
          {entry.hidden ? (
            <button type="button" onClick={props.onShow} style={LOOK.button}>
              Show
            </button>
          ) : (
            <button type="button" onClick={props.onHide} style={LOOK.button}>
              Hide
            </button>
          )}
          <button type="button" onClick={props.onShare} style={LOOK.button}>
            Share
          </button>
          <button type="button" onClick={() => setConfirmingDelete(true)} style={LOOK.dangerButton}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
