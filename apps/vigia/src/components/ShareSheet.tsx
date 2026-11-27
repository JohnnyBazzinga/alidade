// The Share sheet (design §9, D13, D23.6; Req 9.3, 10.1, 10.6 to 10.8, 10.11, 10.12, 15.2, 15.6,
// 17.4). A Sighting leaves the phone only through one of its controls, each an explicit act that
// records its own channel once it has succeeded. The sheet, in Mira's order (design D26.6): "Share
// this sighting" in small capitals and the bearing as its title; a hidden sighting marked; the two
// choices as cards ("Show QR code", for someone beside you, in yellow; "Send link", for someone far
// away); the compact statement of what leaves (always visible); "What the code holds" and "Other
// ways (no connection)" as tiles that open; and at the foot "What leaves this phone" and Close. The
// QR is a view of its own. A refusal is shown beside the control that was refused. In Simulation
// mode: one choice for each other simulated phone, and the text.

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
  SHARE_QR_FOR,
  SHARE_QR_LABEL,
  SHARE_QR_TITLE,
  SHARE_SEND_FOR,
  SHARE_SEND_LABEL,
  SHARE_SEND_TITLE,
} from '../math/texts';
import type { VigiaFailure, VigiaResult } from '../result';
import { BODY_FONT_STACK, Icon, NUMERIC_FONT_STACK, ROLE_VARS, type IconName } from '@alidade/ui';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { Disclosure } from './Disclosure';
import { InlineIcon } from './cards/parts';
import { LOOK, SHAPE } from './look';
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

/** A choice's words (Mira): its icon, its title at 19 extra bold, for whom under it, a chevron. */
function OptionWords({
  icon,
  title,
  sub,
  dim = false,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly sub: string;
  readonly dim?: boolean;
}) {
  return (
    <>
      <Icon name={icon} style={{ width: 34, height: 34 }} />
      <span style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 19 }}>{title}</span>
        <span
          style={{
            fontFamily: BODY_FONT_STACK,
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: 0,
            ...(dim ? { color: ROLE_VARS.inkDim } : {}),
          }}
        >
          {sub}
        </span>
      </span>
      <Icon name="chevron-right" style={{ width: 16, height: 16 }} />
    </>
  );
}

/** The statement with its last sentence bold (Mira: "It cannot be taken back."). */
function HeadlineLast({ text }: { readonly text: string }) {
  const end = text.lastIndexOf('. ', text.length - 2);
  if (end < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, end + 1)}{' '}
      <strong style={{ fontWeight: 800, color: ROLE_VARS.ink }}>{text.slice(end + 2)}</strong>
    </>
  );
}

export function ShareSheet({ sightingId, onClose, onPrivacy }: ShareSheetProps) {
  const environment = useEnvironment();
  const store = useStore();
  const { state } = useVigia();
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Outcome>>>({});
  const [qr, setQr] = useState<QrMatrix | null>(null);
  const viewRef = useOpenAtTop<HTMLElement>(qr === null ? 'sheet' : 'qr');
  // The views of the sheet have no App header (Mira): each has its own title.
  useHeader(null);

  const incident = state.incidents.find((i) =>
    i.entries.some((e) => e.sighting.sightingId === sightingId),
  );
  const entry = incident?.entries.find((e) => e.sighting.sightingId === sightingId);
  const closeButton = (
    <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 8 }}>
      <button
        type="button"
        onClick={onPrivacy}
        style={{ ...LOOK.button, flex: '1 1 auto', minHeight: 58 }}
      >
        What leaves this phone
      </button>
      <button type="button" onClick={onClose} style={LOOK.darkButton}>
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
            <Icon name="copy" />
            Copy text
          </button>
        </>
      )}
    </Disclosure>
  );

  // The QR view: a view of its own, at the top, with Back to the sheet (Req 10.6, 10.12), as Mira
  // draws it: a round Back beside the bearing in small capitals, the title, the QR on a white card
  // with an edge of 2 in ink (black on white in every theme, Req 22.10), and the one line.
  if (qr !== null && link !== null && link.ok) {
    return (
      <section ref={viewRef} data-testid="qr-view" style={{ ...LOOK.stack, gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            aria-label="Back"
            onClick={() => setQr(null)}
            style={LOOK.roundButton}
          >
            <Icon name="chevron-left" style={{ width: 18, height: 18 }} />
          </button>
          {direction.ok && (
            <p style={{ ...LOOK.caption, fontSize: 13 }}>{`Toward ${direction.value} · true`}</p>
          )}
        </div>
        <h1 style={{ ...LOOK.title, fontSize: 30, letterSpacing: '-1px' }}>{QR_VIEW_TITLE}</h1>
        <div
          data-part="qr-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            padding: '24px 20px 18px',
            background: ROLE_VARS.qrLight,
            borderRadius: 28,
            border: `2px solid ${ROLE_VARS.ink}`,
            color: ROLE_VARS.qrDark,
          }}
        >
          <QrImage matrix={qr} link={link.value} />
        </div>
        <p style={{ ...LOOK.dim, padding: '0 4px' }}>{QR_ONE_LINE_TEXT}</p>
      </section>
    );
  }
  return (
    <section ref={viewRef} data-testid="share-sheet" style={LOOK.stack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={LOOK.caption}>Share this sighting</p>
        {direction.ok && (
          <h1
            aria-label={`Toward ${direction.value} (true north)`}
            style={{
              ...LOOK.title,
              fontSize: 30,
              lineHeight: 1.08,
              letterSpacing: '-1px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Toward {direction.value}
          </h1>
        )}
        {direction.ok && <p style={{ ...LOOK.dim, fontSize: 14 }}>true north</p>}
      </div>
      {entry.hidden && (
        <div style={LOOK.statusCard('warning')}>
          <p data-testid="hidden-mark" style={LOOK.alertText}>
            <InlineIcon name="hide" colour={ROLE_VARS.warnIcon} />
            You hid this one: it is not used on this phone. The person you send it to will not know
            that you hid it.
          </p>
        </div>
      )}
      {!simulationMode && simulatedSmoke && (
        <FailureNotice failure={{ ok: false, reason: 'simulation_not_shareable' }} />
      )}
      {link !== null && !link.ok && <FailureNotice failure={link} />}
      {link !== null && link.ok && (
        <div style={{ ...LOOK.stack, gap: 10 }} data-testid="share-choices">
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
            aria-label={SHARE_QR_LABEL}
            style={{
              ...LOOK.optionButton,
              minHeight: 84,
              border: 'none',
              background: ROLE_VARS.primary,
              color: ROLE_VARS.primaryInk,
              boxShadow: SHAPE.primaryShadow,
            }}
          >
            <OptionWords icon="qr" title={SHARE_QR_TITLE} sub={SHARE_QR_FOR} />
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
            aria-label={SHARE_SEND_LABEL}
            style={{ ...LOOK.optionButton, minHeight: 84 }}
          >
            <OptionWords icon="link" title={SHARE_SEND_TITLE} sub={SHARE_SEND_FOR} dim />
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
                style={LOOK.optionButton}
              >
                <span style={LOOK.optionIcon}>
                  <Icon name="send" />
                </span>
                Send to {peer.label}
              </button>
              <OutcomeLine outcome={outcomes[`peer:${peer.id}`]} />
            </div>
          ))}
        </div>
      )}
      {/* The statement before a code leaves the phone (Req 15.2, 22.10), on Mira's soft panel. */}
      <p
        role="note"
        data-testid="leaves-statement"
        style={{
          ...LOOK.text,
          fontSize: 13,
          lineHeight: 1.45,
          padding: '14px 16px',
          borderRadius: SHAPE.tileRadius,
          background: ROLE_VARS.raised,
          color: ROLE_VARS.infoInk,
        }}
      >
        <HeadlineLast text={LEAVES_STATEMENT_TEXT} />
      </p>
      <Disclosure testId="code-holds-details" summary="What the code holds">
        <p data-testid="code-holds" style={LOOK.text}>
          {CODE_HOLDS_TEXT}
        </p>
      </Disclosure>
      {textSection}
      {closeButton}
    </section>
  );
}
