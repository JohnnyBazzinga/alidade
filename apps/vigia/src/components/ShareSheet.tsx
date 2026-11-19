// The Share sheet (design §9, D13; Req 9.3, 10.1, 10.5 to 10.8, 15.2, 15.6, 17.4). A Sighting
// leaves the phone only through one of its buttons, each an explicit act that records its own
// channel once it has succeeded. First what a code holds (in full before the first Share of the
// page session, in the details after), a hidden sighting marked, then one code in three
// presentations: the link (someone far away), the QR (someone beside you; drawn only when asked)
// and the text (a phone with the app open and no connection). A refusal is shown beside the button
// that was refused. In Simulation mode: the text and one button for each other simulated phone.

import { useState } from 'react';
import type { QrMatrix } from '../adapters/qr-encoder';
import { groupCode } from '../math/code/alphabet';
import { buildSightingLink } from '../math/code/code-link';
import { directionText } from '../math/fix/format';
import { incidentMode } from '../math/incident/ids';
import type { ShareChannel } from '../math/incident/incident-state';
import {
  CODE_HOLDS_TEXT,
  LINK_PURPOSE_TEXT,
  QR_PURPOSE_TEXT,
  TEXT_PURPOSE_TEXT,
} from '../math/texts';
import type { VigiaFailure, VigiaResult } from '../result';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { QrImage } from './QrImage';
import { useStore, useVigia } from './store';

export interface ShareSheetProps {
  readonly sightingId: string;
  readonly onClose: () => void;
  readonly onPrivacy: () => void;
}

/** What the browser's share sheet reports when the user closes it: not a failure (decision 2). */
const CANCELLED = 'AbortError';

type Outcome =
  | { readonly kind: 'done'; readonly text: string }
  | { readonly kind: 'failed'; readonly failure: VigiaFailure };

function OutcomeLine({ outcome }: { readonly outcome: Outcome | undefined }) {
  if (outcome === undefined) return null;
  if (outcome.kind === 'failed') return <FailureNotice failure={outcome.failure} />;
  return (
    <p role="status" style={LOOK.dim}>
      {outcome.text}
    </p>
  );
}

export function ShareSheet({ sightingId, onClose, onPrivacy }: ShareSheetProps) {
  const environment = useEnvironment();
  const store = useStore();
  const { state, sharesThisSession } = useVigia();
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});
  const [qr, setQr] = useState<QrMatrix | null>(null);

  const incident = state.incidents.find((i) =>
    i.entries.some((e) => e.sighting.sightingId === sightingId),
  );
  const entry = incident?.entries.find((e) => e.sighting.sightingId === sightingId);
  const closeButton = (
    <div style={LOOK.controls}>
      <button type="button" onClick={onPrivacy} style={LOOK.button}>
        What leaves this phone
      </button>
      <button type="button" onClick={onClose} style={LOOK.button}>
        Close
      </button>
    </div>
  );
  if (incident === undefined || entry === undefined) {
    return (
      <section data-testid="share-sheet" style={LOOK.stack}>
        <p style={LOOK.readout}>This sighting is no longer on this phone.</p>
        {closeButton}
      </section>
    );
  }

  const code = entry.code;
  const grouped = groupCode(code);
  const set = (key: string, outcome: Outcome) => setOutcomes((o) => ({ ...o, [key]: outcome }));
  /** After the act succeeded: record the channel, or show why it could not be recorded. */
  const record = (key: string, channel: ShareChannel, doneText: string) => {
    const marked = store.markShared(sightingId, channel);
    set(key, marked.ok ? { kind: 'done', text: doneText } : { kind: 'failed', failure: marked });
  };
  const act = (
    key: string,
    channel: ShareChannel,
    doneText: string,
    run: () => Promise<VigiaResult<void>>,
  ) => {
    void run().then((result) => {
      if (result.ok) record(key, channel, doneText);
      else if (result.errorName !== CANCELLED) set(key, { kind: 'failed', failure: result });
    });
  };

  const direction = directionText(
    entry.sighting.bearing.azimuthRad,
    entry.sighting.bearing.azimuthSigmaRad,
  );
  const simulationMode = environment.mode === 'simulation';
  const simulatedSmoke = incidentMode(incident.incidentId) === 'simulation';
  const link =
    simulationMode || simulatedSmoke
      ? null
      : buildSightingLink(environment.page.address(), code, environment.parameters);

  const statement = (
    <p data-testid="code-holds" style={LOOK.text}>
      {CODE_HOLDS_TEXT}
    </p>
  );

  const textSection = (
    <section data-testid="share-text" style={LOOK.panel}>
      <h2 style={LOOK.title}>Text code</h2>
      <p style={LOOK.text}>
        {simulationMode
          ? 'In the simulator the code goes to another simulated phone, as text.'
          : TEXT_PURPOSE_TEXT}
      </p>
      <p style={{ ...LOOK.readout, userSelect: 'all' }}>{grouped}</p>
      {!simulationMode && (
        <>
          <OutcomeLine outcome={outcomes.text} />
          <button
            type="button"
            onClick={() =>
              act('text', 'text', 'Text code copied.', () =>
                environment.clipboard.copyText(grouped),
              )
            }
            style={LOOK.button}
          >
            Copy text
          </button>
        </>
      )}
      {simulationMode &&
        environment.peers.map((peer) => (
          <div key={peer.id} style={LOOK.stack}>
            <OutcomeLine outcome={outcomes[`peer:${peer.id}`]} />
            <button
              type="button"
              onClick={() => {
                void store.sendToPeer(peer, sightingId).then((sent) => {
                  set(
                    `peer:${peer.id}`,
                    sent.ok
                      ? { kind: 'done', text: `Sent to ${peer.label}.` }
                      : { kind: 'failed', failure: sent },
                  );
                });
              }}
              style={LOOK.button}
            >
              Send to {peer.label}
            </button>
          </div>
        ))}
    </section>
  );

  return (
    <section data-testid="share-sheet" style={LOOK.stack}>
      <h1 style={LOOK.title}>Share this sighting</h1>
      {direction.ok && <p style={LOOK.readout}>Toward {direction.value} (true north)</p>}
      {entry.hidden && (
        <p data-testid="hidden-mark" style={LOOK.alertText}>
          You hid this one: it is not used on this phone. The person you send it to will not know
          that you hid it.
        </p>
      )}
      <div style={LOOK.panel}>
        {sharesThisSession === 0 ? (
          <>
            <h2 style={LOOK.title}>What the code holds</h2>
            {statement}
          </>
        ) : (
          <details>
            <summary style={{ ...LOOK.text, minHeight: 48, display: 'flex', alignItems: 'center' }}>
              What the code holds
            </summary>
            {statement}
          </details>
        )}
      </div>
      {!simulationMode && simulatedSmoke && (
        <FailureNotice failure={{ ok: false, reason: 'simulation_not_shareable' }} />
      )}
      {link !== null && !link.ok && <FailureNotice failure={link} />}
      {link !== null && link.ok && (
        <>
          <section data-testid="share-link" style={LOOK.panel}>
            <h2 style={LOOK.title}>Link</h2>
            <p style={LOOK.text}>{LINK_PURPOSE_TEXT}</p>
            <p style={{ ...LOOK.text, userSelect: 'all' }}>{link.value}</p>
            <OutcomeLine outcome={outcomes.link} />
            <div style={LOOK.controls}>
              <button
                type="button"
                onClick={() =>
                  act('link', 'link', 'Link copied.', () =>
                    environment.clipboard.copyText(link.value),
                  )
                }
                style={LOOK.button}
              >
                Copy link
              </button>
              {environment.clipboard.canShare && (
                <button
                  type="button"
                  onClick={() =>
                    act('link', 'system_share', 'Link shared.', () =>
                      environment.clipboard.shareLink(link.value),
                    )
                  }
                  style={LOOK.button}
                >
                  Share…
                </button>
              )}
            </div>
          </section>
          <section data-testid="share-qr" style={LOOK.panel}>
            <h2 style={LOOK.title}>QR code</h2>
            <p style={LOOK.text}>{QR_PURPOSE_TEXT}</p>
            <OutcomeLine outcome={outcomes.qr} />
            {qr === null ? (
              <button
                type="button"
                onClick={() => {
                  const matrix = environment.qr.qrMatrix(link.value);
                  if (!matrix.ok) {
                    set('qr', { kind: 'failed', failure: matrix });
                    return;
                  }
                  setQr(matrix.value);
                  record('qr', 'qr', 'The QR code is on the screen.');
                }}
                style={LOOK.button}
              >
                Show QR code
              </button>
            ) : (
              <QrImage matrix={qr} link={link.value} />
            )}
          </section>
        </>
      )}
      {textSection}
      {closeButton}
    </section>
  );
}
