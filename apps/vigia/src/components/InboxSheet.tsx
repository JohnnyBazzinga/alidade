// The Inbox sheet, "Add a sighting someone sent me" (design §9, D7; Req 4.2, 9.4, 10.3, 10.4,
// 15.7, 15.8, 17.4). Every code that reached the phone, by a paste, a link or the Transport, waits
// here as a card until the user adds or ignores it. A card shows the direction with its sigma, the
// accuracy, the age and which smoke it is of, and never the observer's position: that is shown only
// once the user has added it. A code of a smoke this phone does not have is opened as a new smoke
// only after one confirmation.

import { useState } from 'react';
import { ageText } from '../math/civil-time';
import { accuracyText, directionText } from '../math/fix/format';
import { incidentMode } from '../math/incident/ids';
import type { InboxItem, VigiaState } from '../math/incident/incident-state';
import { NO_PROOF_TEXT } from '../math/texts';
import type { VigiaFailure } from '../result';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useStore, useVigia } from './store';

export interface InboxSheetProps {
  readonly onClose: () => void;
}

const ADDRESS_HOLDS_CODE_TEXT =
  'The address of this page still holds the code, so do not share or bookmark this page.';
const SIMULATED_TEXT = 'This code comes from a simulation, not from a real place.';

function smokeText(item: InboxItem, state: VigiaState, inbox: readonly InboxItem[]): string {
  const incidentId = item.sighting.incidentId;
  if (incidentId === state.openIncidentId) return 'For the smoke you have open';
  if (state.incidents.some((i) => i.incidentId === incidentId)) {
    return 'For another smoke on this phone';
  }
  const waiting = inbox.filter((i) => i.sighting.incidentId === incidentId).length;
  return `For a smoke this phone does not have (${waiting} sighting${waiting === 1 ? '' : 's'} waiting)`;
}

function Card({ item }: { readonly item: InboxItem }) {
  const store = useStore();
  const { state, inbox, nowUtcMs } = useVigia();
  const [confirmingOpen, setConfirmingOpen] = useState(false);
  const [failure, setFailure] = useState<VigiaFailure | null>(null);
  const { bearing, incidentId, sightingId } = item.sighting;
  const known = state.incidents.find((i) => i.incidentId === incidentId);
  const held = known?.entries.find((e) => e.sighting.sightingId === sightingId);
  const direction = directionText(bearing.azimuthRad, bearing.azimuthSigmaRad);
  const accuracy = accuracyText(bearing.positionAccuracyM);
  const add = (joinIfUnknown: boolean) => {
    const result = store.addFromInbox(item.code, joinIfUnknown);
    if (!result.ok) setFailure(result);
  };
  return (
    <li data-testid="inbox-card" style={{ ...LOOK.panel, listStyle: 'none' }}>
      {direction.ok && <p style={LOOK.readout}>Toward {direction.value} (true north)</p>}
      {accuracy.ok && <p style={LOOK.text}>Observer position known to {accuracy.value}</p>}
      <p style={LOOK.text}>Taken {ageText(nowUtcMs - bearing.timeUtcMs)}</p>
      <p style={{ ...LOOK.text, fontWeight: 700 }}>{smokeText(item, state, inbox)}</p>
      {held !== undefined && (
        <p style={LOOK.dim}>
          {held.code === item.code
            ? 'Already on this phone: adding it changes nothing.'
            : 'This phone holds a different sighting under the same identifier.'}
        </p>
      )}
      {incidentMode(incidentId) === 'simulation' && <p style={LOOK.alertText}>{SIMULATED_TEXT}</p>}
      {failure !== null && <FailureNotice failure={failure} />}
      {confirmingOpen ? (
        <div role="group" style={LOOK.alertPanel}>
          <p style={LOOK.text}>
            Open this as a new smoke on this phone? Its sightings will be listed with where they
            came from.
          </p>
          <div style={LOOK.controls}>
            <button type="button" onClick={() => add(true)} style={LOOK.button}>
              Open it as a new smoke
            </button>
            <button type="button" onClick={() => setConfirmingOpen(false)} style={LOOK.button}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <div style={LOOK.controls}>
          {known === undefined ? (
            <button type="button" onClick={() => setConfirmingOpen(true)} style={LOOK.button}>
              Open it as a new smoke on this phone
            </button>
          ) : (
            <button type="button" onClick={() => add(false)} style={LOOK.button}>
              Add
            </button>
          )}
          <button type="button" onClick={() => store.ignore(item.code)} style={LOOK.button}>
            Ignore
          </button>
        </div>
      )}
    </li>
  );
}

export function InboxSheet({ onClose }: InboxSheetProps) {
  const store = useStore();
  const { inbox, receiveFailure, addressHoldsCode } = useVigia();
  const [pasted, setPasted] = useState('');
  const [pasteFailure, setPasteFailure] = useState<VigiaFailure | null>(null);
  const read = () => {
    const result = store.paste(pasted);
    if (result.ok) {
      setPasted('');
      setPasteFailure(null);
    } else {
      setPasteFailure(result);
    }
  };
  return (
    <section data-testid="inbox-sheet" style={LOOK.stack}>
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
      <p style={LOOK.dim}>{NO_PROOF_TEXT}</p>
      {inbox.length > 0 && (
        <ol style={{ ...LOOK.stack, margin: 0, padding: 0 }}>
          {inbox.map((item) => (
            <Card key={item.code} item={item} />
          ))}
        </ol>
      )}
      <div data-testid="paste-box" style={LOOK.panel}>
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
      <div style={LOOK.controls}>
        <button type="button" onClick={onClose} style={LOOK.button}>
          Close
        </button>
      </div>
    </section>
  );
}
