// The Smoke screen, the first screen (design §9, D23; Req 4.5, 4.11, 4.12, 5.4, 5.5, 6.12, 7.2 to
// 7.5, 14.5, 16.1, 17.1). The first view is short and in the order of importance: the not-calling
// statement (one line), the line after a capture or a join, a disagreement when there is one, the
// position with its 95 % radius, how many sightings it rests on, every warning that applies, the
// sentence for two or three sightings, one sentence on compasses, and "Show on map". Everything
// else is under ONE disclosure, "Details and limits"; Delete, "What leaves this phone" and the
// mode control are under another, "This phone's data and mode". The primary action is in the App's
// row above the tabs (task 21.3): "Sight the smoke", or, right after a capture, "Send this
// sighting".

import { useState, type ReactNode } from 'react';
import {
  checkStatement,
  disagreementStatement,
  incidentStatement,
} from '../math/assessment/statements';
import type { Assessment } from '../math/assessment/assess';
import { ageText, clockTextUtc } from '../math/civil-time';
import { savedLineText } from '../math/fix/format';
import type { Incident } from '../math/incident/incident-state';
import { COMPASS_ONE_LINE_TEXT, NOT_CALLING_TEXT } from '../math/texts';
import { AdviceView } from './AdviceView';
import { DeleteAllDialog } from './DeleteAllDialog';
import { Disclosure } from './Disclosure';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { FixWordsView } from './FixWordsView';
import { LimitsBlock } from './LimitsBlock';
import { LOOK } from './look';
import { PrimaryAction } from './PrimaryAction';
import { useStore, useVigia, type OpenView, type OwnPosition } from './store';

export interface SmokeScreenProps {
  readonly onSight: () => void;
  readonly onInbox: () => void;
  readonly onPrivacy: () => void;
  /** "Show on map": opens the Map tab (Req 6.12). */
  readonly onShowMap?: () => void;
  /** "Send this sighting": opens the Share sheet for that sighting (Req 4.11). */
  readonly onSend?: (sightingId: string) => void;
  /** Right after a capture: "Sighting saved: …" and "Send this sighting" as the primary action. */
  readonly saved?: { readonly sightingId: string };
  /** Right after a join, an add or a new smoke: the one line of Req 4.12. */
  readonly statusLine?: string;
  /** "This phone" / "Simulator", shown only when the browser has motion sensors (Req 17.1). */
  readonly modeControl?: ReactNode;
  /** In Simulation mode, with nothing sighted on this phone: the reviewer's path (task 21.5). */
  readonly reviewerPath?: ReactNode;
}

/** The failures of the solve after which the advice is to move sideways (Req 7.5). */
const MOVE_SIDEWAYS_AFTER = ['singular_geometry', 'colocated_observers'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function startedText(incident: Incident, nowUtcMs: number): string {
  return `Smoke started ${clockTextUtc(incident.createdUtcMs)}, ${ageText(nowUtcMs - incident.createdUtcMs)}`;
}

/** The first view of the result (Req 6.12) and, apart, what goes under "Details and limits". */
function resultParts({
  view,
  assessment,
  nowUtcMs,
  ownPosition,
  parameters,
  onShowMap,
}: {
  readonly view: OpenView;
  readonly assessment: Assessment;
  readonly nowUtcMs: number;
  readonly ownPosition: OwnPosition | null;
  readonly parameters: ReturnType<typeof useEnvironment>['parameters'];
  readonly onShowMap: (() => void) | undefined;
}): { readonly first: ReactNode; readonly details: ReactNode } {
  const usedCount = assessment.used.length;
  const fix = assessment.fix;
  const fixOk = fix !== null && fix.ok;
  const showAdvice =
    view.advice !== null &&
    (usedCount === 1 || (fix !== null && (fix.ok || MOVE_SIDEWAYS_AFTER.includes(fix.reason))));
  const diverging = assessment.disagreement === 'diverging';
  const level = assessment.checkLevel;
  // With a Fix, the sentence for two or three is the warning that applies; the longer one for
  // four or more is under the disclosure. Without a Fix every sentence is the first view's.
  const checkInFirst = usedCount > 0 && (!fixOk || level === 'two' || level === 'three');
  const advice = showAdvice && view.advice !== null ? <AdviceView advice={view.advice} /> : null;

  const first = (
    <>
      {diverging && (
        <div style={LOOK.alertPanel}>
          <p data-testid="disagreement" style={LOOK.alertText}>
            {disagreementStatement('diverging', assessment.checkLevel)}
          </p>
        </div>
      )}
      {fixOk && (
        <FixWordsView
          part="first"
          fix={fix.value}
          assessment={assessment}
          nowUtcMs={nowUtcMs}
          ownPosition={ownPosition}
          parameters={parameters}
        />
      )}
      {fix !== null && !fix.ok && <FailureNotice failure={fix} />}
      {usedCount === 0 && view.incident.entries.length > 0 && (
        <p style={LOOK.statement}>
          None of these sightings is used; the Sightings tab says why each was set aside.
        </p>
      )}
      {checkInFirst && (
        <p data-testid="check-statement" style={usedCount === 1 ? LOOK.statement : LOOK.text}>
          {checkStatement(level)}
        </p>
      )}
      {usedCount > 0 && <p style={LOOK.text}>{COMPASS_ONE_LINE_TEXT}</p>}
      {fixOk && onShowMap !== undefined && (
        <button type="button" onClick={onShowMap} style={LOOK.button}>
          Show on map
        </button>
      )}
      {/* No Fix: where to sight from next is what the user needs (Req 7.4, 7.5). */}
      {!fixOk && advice}
    </>
  );

  const details = (
    <>
      {fixOk && (
        <FixWordsView
          part="details"
          fix={fix.value}
          assessment={assessment}
          nowUtcMs={nowUtcMs}
          ownPosition={ownPosition}
          parameters={parameters}
        />
      )}
      {usedCount > 0 && !checkInFirst && (
        <p data-testid="check-statement" style={LOOK.text}>
          {checkStatement(level)}
        </p>
      )}
      {usedCount > 0 && <LimitsBlock withFix={fixOk} />}
      <p style={LOOK.dim}>{incidentStatement()}</p>
      {fixOk && advice}
    </>
  );
  return { first, details };
}

export function SmokeScreen({
  onSight,
  onInbox,
  onPrivacy,
  onShowMap,
  onSend,
  saved,
  statusLine,
  modeControl,
  reviewerPath,
}: SmokeScreenProps) {
  const store = useStore();
  const environment = useEnvironment();
  const snapshot = useVigia();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { open, nowUtcMs, inbox, notices, state, ownPosition } = snapshot;
  const others = state.incidents.filter((i) => i.incidentId !== state.openIncidentId);

  const savedEntry =
    saved === undefined
      ? undefined
      : state.incidents
          .flatMap((i) => i.entries)
          .find((e) => e.sighting.sightingId === saved.sightingId);
  const savedLine =
    savedEntry === undefined
      ? null
      : savedLineText(
          savedEntry.sighting.bearing.azimuthRad,
          savedEntry.sighting.bearing.azimuthSigmaRad,
        );

  const parts =
    open !== null && open.assessment.ok
      ? resultParts({
          view: open,
          assessment: open.assessment.value,
          nowUtcMs,
          ownPosition,
          parameters: environment.parameters,
          onShowMap,
        })
      : null;

  // Right after a capture, "Send this sighting" is the primary action and this one is secondary.
  const sendIsPrimary = saved !== undefined && savedEntry !== undefined;
  const sightButton = (
    <button
      type="button"
      {...(!sendIsPrimary ? { 'data-primary': 'true' } : {})}
      onClick={onSight}
      style={!sendIsPrimary ? LOOK.primaryButton : LOOK.button}
    >
      Sight the smoke
    </button>
  );

  return (
    <section data-testid="smoke-screen" style={LOOK.stack}>
      <p data-testid="not-calling" style={{ ...LOOK.text, fontWeight: 700 }}>
        {NOT_CALLING_TEXT}
      </p>
      {statusLine !== undefined && (
        <p data-testid="status-line" style={LOOK.text}>
          {statusLine}
        </p>
      )}
      {savedLine !== null && savedLine.ok && (
        <p data-testid="status-line" style={LOOK.text}>
          {savedLine.value}
        </p>
      )}
      {open === null ? (
        <>
          <div style={LOOK.panel}>
            <h1 style={LOOK.title}>No smoke yet</h1>
            <p style={LOOK.text}>{checkStatement('none')}</p>
          </div>
          {reviewerPath}
        </>
      ) : open.assessment.ok ? (
        parts?.first
      ) : (
        <FailureNotice failure={open.assessment} />
      )}
      {saved !== undefined && savedEntry !== undefined && sightButton}
      <button type="button" onClick={onInbox} style={LOOK.button}>
        Add a sighting someone sent me{inbox.length > 0 ? ` (${inbox.length} waiting)` : ''}
      </button>
      {notices.map((notice) => (
        <FailureNotice
          key={notice.reason}
          failure={{ ok: false, reason: notice.reason }}
          {...(notice.count === undefined ? {} : { count: notice.count })}
        />
      ))}
      {open !== null && (
        <Disclosure summary="Details and limits">
          <p style={LOOK.dim}>{startedText(open.incident, nowUtcMs)}</p>
          {open.assessment.ok && (
            <p style={LOOK.text}>
              {plural(open.incident.entries.length, 'sighting', 'sightings')},{' '}
              {open.assessment.value.used.length} used
            </p>
          )}
          {parts?.details}
        </Disclosure>
      )}
      {others.length > 0 && (
        <section data-testid="other-smokes" style={LOOK.panel}>
          <h2 style={LOOK.title}>Other smokes on this phone</h2>
          {others.map((incident) => (
            <button
              key={incident.incidentId}
              type="button"
              onClick={() =>
                store.dispatch({ kind: 'openIncident', incidentId: incident.incidentId })
              }
              style={LOOK.button}
            >
              Open the smoke started {clockTextUtc(incident.createdUtcMs)} (
              {plural(incident.entries.length, 'sighting', 'sightings')})
            </button>
          ))}
        </section>
      )}
      <Disclosure
        summary={`This phone's data and mode: ${environment.mode === 'simulation' ? 'Simulator' : 'This phone'}`}
      >
        {confirmingDelete ? (
          <DeleteAllDialog
            backupExists={snapshot.hasBackup}
            onConfirm={() => {
              store.dispatch({ kind: 'deleteAll' });
              setConfirmingDelete(false);
            }}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} style={LOOK.dangerButton}>
            Delete everything on this phone
          </button>
        )}
        <button type="button" onClick={onPrivacy} style={LOOK.button}>
          What leaves this phone
        </button>
        {modeControl}
      </Disclosure>
      <PrimaryAction>
        {sendIsPrimary && savedEntry !== undefined ? (
          <button
            type="button"
            data-primary="true"
            onClick={() => onSend?.(savedEntry.sighting.sightingId)}
            style={LOOK.primaryButton}
          >
            Send this sighting
          </button>
        ) : (
          sightButton
        )}
      </PrimaryAction>
    </section>
  );
}
