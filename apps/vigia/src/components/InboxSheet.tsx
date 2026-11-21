// The Inbox sheet, "Add a sighting someone sent me" (design §9, D7, D23.7; Req 4.2, 4.8, 4.12, 9.4,
// 10.3, 10.4, 10.12, 15.7, 15.8, 17.4). Every code that reached the phone, by a paste, a link or the
// Transport, waits here as a compact card until the user adds or ignores it: the direction with its
// sigma, the age, the accuracy and which smoke it is of, never the observer's position (that is
// shown only once the user has added it), one visible line that a code may be wrong, and "Why check
// this?". Choosing "the same smoke", "a different smoke" or "open as a new smoke" replaces the card
// by a confirmation view of its own; a success closes the sheet with one line on the Smoke screen.

import { useState } from 'react';
import { ageText } from '../math/civil-time';
import { accuracyText, directionText } from '../math/fix/format';
import { incidentMode } from '../math/incident/ids';
import { incidentHolding, type InboxItem, type VigiaState } from '../math/incident/incident-state';
import { relabelItem } from '../math/incident/join';
import {
  countLineText,
  INBOX_WARNING_LINE_TEXT,
  JOIN_CONFIRM_TEXT,
  JOIN_HIDE_TEXT,
  NO_PROOF_TEXT,
  OPEN_NEW_CONFIRM_TEXT,
} from '../math/texts';
import type { VigiaFailure } from '../result';
import { Disclosure } from './Disclosure';
import { FailureNotice } from './FailureNotice';
import { useEnvironment } from './environment';
import { LOOK } from './look';
import { useStore, useVigia } from './store';
import { useOpenAtTop } from './use-open-at-top';

export interface InboxSheetProps {
  readonly onClose: () => void;
  /**
   * A card was taken in (joined, added or opened as a new smoke): the App closes the sheet and
   * opens the Smoke screen at its top with this line (Req 4.12).
   */
  readonly onTaken?: (line: string) => void;
}

const ADDRESS_HOLDS_CODE_TEXT =
  'The address of this page still holds the code, so do not share or bookmark this page.';
const SIMULATED_TEXT = 'This code comes from a simulation, not from a real place.';

type Confirming = { readonly kind: 'join' | 'open'; readonly code: string };

function smokeText(item: InboxItem, state: VigiaState, inbox: readonly InboxItem[]): string {
  const incidentId = item.sighting.incidentId;
  // A smoke is held under its id or a former id (design §7.4a).
  // A state the store holds has only finite numbers; a refusal reads as "not held".
  const found = incidentHolding(state, incidentId);
  const holder = found.ok ? found.value : null;
  if (holder !== null) {
    return holder.incidentId === state.openIncidentId
      ? 'For the smoke you have open'
      : 'For another smoke on this phone';
  }
  const waiting = inbox.filter((i) => i.sighting.incidentId === incidentId).length;
  return `For a smoke this phone does not have (${waiting} sighting${waiting === 1 ? '' : 's'} waiting)`;
}

function Card({
  item,
  onConfirm,
  onTaken,
}: {
  readonly item: InboxItem;
  readonly onConfirm: (c: Confirming) => void;
  readonly onTaken: (line: string) => void;
}) {
  const store = useStore();
  const { state, inbox, nowUtcMs } = useVigia();
  const { parameters } = useEnvironment();
  const [failure, setFailure] = useState<VigiaFailure | null>(null);
  const { bearing, incidentId, sightingId } = item.sighting;
  const found = incidentHolding(state, incidentId);
  const known = found.ok ? found.value : null;
  const held = known?.entries.find((e) => e.sighting.sightingId === sightingId);
  // The same sighting under the id the smoke has now, to tell a duplicate from a different one.
  const asHeld = known === null ? null : relabelItem(item, known.incidentId, parameters);
  const heldCode = asHeld !== null && asHeld.ok ? asHeld.value.code : item.code;
  // An Incident is open: the code of a smoke this phone does not have may be of the same smoke.
  const asksSameSmoke = known === null && state.openIncidentId !== null;
  const direction = directionText(bearing.azimuthRad, bearing.azimuthSigmaRad);
  const accuracy = accuracyText(bearing.positionAccuracyM);
  const add = () => {
    const result = store.addFromInbox(item.code, false);
    if (!result.ok) setFailure(result);
    else onTaken(countLineText('added', 1));
  };
  return (
    <li data-testid="inbox-card" style={{ ...LOOK.panel, listStyle: 'none' }}>
      {direction.ok && <p style={LOOK.readout}>Toward {direction.value} (true north)</p>}
      <p style={LOOK.text}>
        Taken {ageText(nowUtcMs - bearing.timeUtcMs)}
        {accuracy.ok && <>. Observer position known to {accuracy.value}</>}
      </p>
      <p style={{ ...LOOK.text, fontWeight: 700 }}>{smokeText(item, state, inbox)}</p>
      {held !== undefined && (
        <p style={LOOK.dim}>
          {held.code === heldCode
            ? 'Already on this phone: adding it changes nothing.'
            : 'This phone holds a different sighting under the same identifier.'}
        </p>
      )}
      {incidentMode(incidentId) === 'simulation' && <p style={LOOK.alertText}>{SIMULATED_TEXT}</p>}
      <p style={LOOK.alertText}>{INBOX_WARNING_LINE_TEXT}</p>
      <Disclosure testId="why-check" summary="Why check this?">
        <p style={LOOK.text}>{NO_PROOF_TEXT}</p>
        <p style={LOOK.text}>{JOIN_HIDE_TEXT}</p>
      </Disclosure>
      {failure !== null && <FailureNotice failure={failure} />}
      <div style={LOOK.controls}>
        {asksSameSmoke ? (
          <>
            <button
              type="button"
              onClick={() => onConfirm({ kind: 'join', code: item.code })}
              style={LOOK.button}
            >
              It is the same smoke as the one I have open
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ kind: 'open', code: item.code })}
              style={LOOK.button}
            >
              It is a different smoke
            </button>
          </>
        ) : known === null ? (
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'open', code: item.code })}
            style={LOOK.button}
          >
            Open it as a new smoke on this phone
          </button>
        ) : (
          <button type="button" onClick={add} style={LOOK.button}>
            Add
          </button>
        )}
        <button type="button" onClick={() => store.ignore(item.code)} style={LOOK.button}>
          Ignore
        </button>
      </div>
    </li>
  );
}

/** The confirmation of a join or of opening a smoke: a view of its own, nothing else in it. */
function ConfirmView({
  confirming,
  onDone,
  onCancel,
}: {
  readonly confirming: Confirming;
  readonly onDone: (line: string) => void;
  readonly onCancel: () => void;
}) {
  const store = useStore();
  const ref = useOpenAtTop<HTMLElement>(`confirm-${confirming.kind}`);
  const [failure, setFailure] = useState<VigiaFailure | null>(null);
  const join = confirming.kind === 'join';
  const confirm = () => {
    if (join) {
      const result = store.joinFromInbox(confirming.code);
      if (!result.ok) return setFailure(result);
      const n = store.getSnapshot().open?.incident.entries.length ?? 0;
      return onDone(countLineText('joined', n));
    }
    const result = store.addFromInbox(confirming.code, true);
    if (!result.ok) return setFailure(result);
    const snapshot = store.getSnapshot();
    const opened = snapshot.state.incidents.find((i) =>
      i.entries.some((e) => e.code === confirming.code),
    );
    return onDone(countLineText('opened', opened?.entries.length ?? 0));
  };
  return (
    <section ref={ref} data-testid="confirm-view" role="group" style={LOOK.alertPanel}>
      <p style={LOOK.text}>{join ? JOIN_CONFIRM_TEXT : OPEN_NEW_CONFIRM_TEXT}</p>
      {failure !== null && <FailureNotice failure={failure} />}
      <div style={LOOK.controls}>
        <button type="button" onClick={confirm} style={LOOK.button}>
          {join ? 'Join the two smokes' : 'Open it as a new smoke'}
        </button>
        <button type="button" onClick={onCancel} style={LOOK.button}>
          Not now
        </button>
      </div>
    </section>
  );
}

export function InboxSheet({ onClose, onTaken }: InboxSheetProps) {
  const store = useStore();
  const { inbox, receiveFailure, addressHoldsCode } = useVigia();
  const [pasted, setPasted] = useState('');
  const [pasteFailure, setPasteFailure] = useState<VigiaFailure | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const top = useOpenAtTop<HTMLElement>('inbox');
  const taken = (line: string) => {
    setConfirming(null);
    onTaken?.(line);
  };
  const read = () => {
    const result = store.paste(pasted);
    if (result.ok) {
      setPasted('');
      setPasteFailure(null);
    } else {
      setPasteFailure(result);
    }
  };
  if (confirming !== null) {
    return (
      <ConfirmView confirming={confirming} onDone={taken} onCancel={() => setConfirming(null)} />
    );
  }
  const pasteBox = (
    <div data-testid="paste-box" style={LOOK.stack}>
      <label htmlFor="vigia-paste" style={LOOK.text}>
        Paste the link or the code
      </label>
      <textarea
        id="vigia-paste"
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        rows={3}
        spellCheck={false}
        autoCapitalize="characters"
        style={{
          ...LOOK.readout,
          width: '100%',
          boxSizing: 'border-box',
          padding: 8,
          background: LOOK.button.background,
          border: LOOK.button.border,
        }}
      />
      {pasteFailure !== null && <FailureNotice failure={pasteFailure} />}
      <button type="button" onClick={read} style={LOOK.button}>
        Read the code
      </button>
    </div>
  );
  return (
    <section ref={top} data-testid="inbox-sheet" style={LOOK.stack}>
      <h1 style={LOOK.title}>Add a sighting someone sent me</h1>
      {addressHoldsCode && (
        <p data-testid="address-holds-code" style={LOOK.alertText}>
          {ADDRESS_HOLDS_CODE_TEXT}
        </p>
      )}
      {receiveFailure !== null && (
        <div data-testid="receive-failure">
          <FailureNotice failure={receiveFailure} />
        </div>
      )}
      {inbox.length === 0 ? (
        <>
          <p style={LOOK.alertText}>{INBOX_WARNING_LINE_TEXT}</p>
          <div style={LOOK.panel}>{pasteBox}</div>
        </>
      ) : (
        <>
          <ol style={{ ...LOOK.stack, margin: 0, padding: 0 }}>
            {inbox.map((item) => (
              <Card key={item.code} item={item} onConfirm={setConfirming} onTaken={taken} />
            ))}
          </ol>
          <Disclosure summary="Paste a code">{pasteBox}</Disclosure>
        </>
      )}
      <div style={LOOK.controls}>
        <button type="button" onClick={onClose} style={LOOK.button}>
          Close
        </button>
      </div>
    </section>
  );
}
