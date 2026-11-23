// The Share sheet (design §9, D13, D23.6; Req 9.3, 10.1, 10.6 to 10.8, 10.11, 10.12, 15.2, 15.6,
// 17.4). A Sighting leaves the phone only through one of its controls, each an explicit act that
// records its own channel once it has succeeded. The sheet is: its title, the bearing in a line,
// a hidden sighting marked, one compact statement of what leaves (always visible), "What the code
// holds" for the long text, two primary choices ("Show QR code (someone beside you)", "Send link
// (someone far away)"), and "Other ways (no connection)" with the text code. The QR is a view of
// its own. A refusal is shown beside the control that was refused. In Simulation mode: one choice
// for each other simulated phone, and the text.

import { useState } from 'react';
import { useHeader } from './header-context';
import { QR_VIEW_TITLE } from '../math/texts';
import type { QrMatrix } from '../adapters/qr-encoder';
import { groupCode } from '../math/code/alphabet';
import { buildSightingLink } from '../math/code/code-link';
import { directionText } from '../math/fix/format';
import { incidentMode } from '../math/incident/ids';
import type { ShareChannel } from '../math/incident/incident-state';
import {
  CODE_HOLDS_TEXT,
  LEAVES_STATEMENT_TEXT,
  QR_ONE_LINE_TEXT,
  SHARE_OTHER_LABEL,
  SHARE_QR_LABEL,
  SHARE_SEND_LABEL,
} from '../math/texts';
import type { VigiaFailure, VigiaResult } from '../result';
import { NUMERIC_FONT_STACK } from '@alidade/ui';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { Disclosure } from './Disclosure';
import { LOOK } from './look';
import { QrImage } from './QrImage';
import { useStore, useVigia } from './store';
import { useOpenAtTop } from './use-open-at-top';

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
  const { state } = useVigia();
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});
  const [qr, setQr] = useState<QrMatrix | null>(null);
  const viewRef = useOpenAtTop<HTMLElement>(qr === null ? 'sheet' : 'qr');
  // The QR view's compact header is titled "QR code" (Req 22.10, 22.15); the sheet's is the route's.
  const inApp = useHeader(qr === null ? null : { variant: 'compact', title: QR_VIEW_TITLE });

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

  const textSection = (
    <Disclosure
      testId="share-text"
      summary={SHARE_OTHER_LABEL}
      open={simulationMode || link === null || !link.ok}
    >
      {simulationMode && (
        <p style={LOOK.text}>In the simulator the code goes to another simulated phone, as text.</p>
      )}
      <p style={{ ...LOOK.readout, fontFamily: NUMERIC_FONT_STACK, userSelect: 'all' }}>
        {grouped}
      </p>
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
    </Disclosure>
  );

  // The QR view: a view of its own, at the top, with Back to the sheet (Req 10.6, 10.12).
  if (qr !== null && link !== null && link.ok) {
    return (
      <section ref={viewRef} data-testid="qr-view" style={LOOK.stack}>
        <button type="button" onClick={() => setQr(null)} style={LOOK.button}>
          Back
        </button>
        <QrImage matrix={qr} link={link.value} />
        <p style={LOOK.text}>{QR_ONE_LINE_TEXT}</p>
      </section>
    );
  }

  return (
    <section ref={viewRef} data-testid="share-sheet" style={LOOK.stack}>
      {!inApp && <h1 style={LOOK.title}>Share this sighting</h1>}
      {direction.ok && <p style={LOOK.readout}>Toward {direction.value} (true north)</p>}
      {entry.hidden && (
        <p data-testid="hidden-mark" style={LOOK.alertText}>
          You hid this one: it is not used on this phone. The person you send it to will not know
          that you hid it.
        </p>
      )}
      <p data-testid="leaves-statement" style={LOOK.text}>
        {LEAVES_STATEMENT_TEXT}
      </p>
      <Disclosure testId="code-holds-details" summary="What the code holds">
        <p data-testid="code-holds" style={LOOK.text}>
          {CODE_HOLDS_TEXT}
        </p>
      </Disclosure>
      {!simulationMode && simulatedSmoke && (
        <FailureNotice failure={{ ok: false, reason: 'simulation_not_shareable' }} />
      )}
      {link !== null && !link.ok && <FailureNotice failure={link} />}
      {link !== null && link.ok && (
        <div style={LOOK.stack} data-testid="share-choices">
          <button
            type="button"
            data-choice="true"
            onClick={() => {
              const matrix = environment.qr.qrMatrix(link.value);
              if (!matrix.ok) {
                set('qr', { kind: 'failed', failure: matrix });
                return;
              }
              setQr(matrix.value);
              record('qr', 'qr', 'The QR code is on the screen.');
            }}
            style={LOOK.primaryButton}
          >
            {SHARE_QR_LABEL}
          </button>
          <OutcomeLine outcome={outcomes.qr} />
          <button
            type="button"
            data-choice="true"
            onClick={() =>
              environment.clipboard.canShare
                ? act('link', 'system_share', 'Link shared.', () =>
                    environment.clipboard.shareLink(link.value),
                  )
                : act('link', 'link', 'Link copied.', () =>
                    environment.clipboard.copyText(link.value),
                  )
            }
            style={LOOK.primaryButton}
          >
            {SHARE_SEND_LABEL}
          </button>
          <OutcomeLine outcome={outcomes.link} />
        </div>
      )}
      {simulationMode && (
        <div style={LOOK.stack} data-testid="share-choices">
          {environment.peers.map((peer) => (
            <div key={peer.id} style={LOOK.stack}>
              <button
                type="button"
                data-choice="true"
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
                style={LOOK.primaryButton}
              >
                Send to {peer.label}
              </button>
              <OutcomeLine outcome={outcomes[`peer:${peer.id}`]} />
            </div>
          ))}
        </div>
      )}
      {textSection}
      {closeButton}
    </section>
  );
}
