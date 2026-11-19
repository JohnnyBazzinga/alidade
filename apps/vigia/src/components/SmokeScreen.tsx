// The Smoke screen, the first screen (design §9; Req 4.5, 5.4, 5.5, 6, 7.2 to 7.5, 14.5, 16.1).
// The order is the order of importance: the not-calling statement (one line), the smoke, a
// disagreement when there is one, where the smoke probably is and how far to trust it, what the
// count can check, the limits, where to sight from next, then the actions, the notices of this
// phone, the Incident's note, the other smokes and the controls of the phone.

import { useState, type ReactNode } from 'react';
import {
  checkStatement,
  disagreementStatement,
  incidentStatement,
} from '../math/assessment/statements';
import type { Assessment } from '../math/assessment/assess';
import { ageText, clockTextUtc } from '../math/civil-time';
import type { Incident } from '../math/incident/incident-state';
import { NOT_CALLING_TEXT } from '../math/texts';
import { AdviceView } from './AdviceView';
import { DeleteAllDialog } from './DeleteAllDialog';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { FixWordsView } from './FixWordsView';
import { LimitsBlock } from './LimitsBlock';
import { LOOK } from './look';
import { useStore, useVigia, type OpenView, type OwnPosition } from './store';

export interface SmokeScreenProps {
  readonly onSight: () => void;
  readonly onInbox: () => void;
  readonly onPrivacy: () => void;
  /** "This phone" / "Simulator", shown only when the browser has motion sensors (Req 17.1). */
  readonly modeControl?: ReactNode;
}

/** The failures of the solve after which the advice is to move sideways (Req 7.5). */
const MOVE_SIDEWAYS_AFTER = ['singular_geometry', 'colocated_observers'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function startedText(incident: Incident, nowUtcMs: number): string {
  return `Smoke started ${clockTextUtc(incident.createdUtcMs)}, ${ageText(nowUtcMs - incident.createdUtcMs)}`;
}

function Result({
  view,
  assessment,
  nowUtcMs,
  ownPosition,
}: {
  readonly view: OpenView;
  readonly assessment: Assessment;
  readonly nowUtcMs: number;
  readonly ownPosition: OwnPosition | null;
}) {
  const { parameters } = useEnvironment();
  const usedCount = assessment.used.length;
  const fix = assessment.fix;
  const showAdvice =
    view.advice !== null &&
    (usedCount === 1 || (fix !== null && (fix.ok || MOVE_SIDEWAYS_AFTER.includes(fix.reason))));
  const diverging = assessment.disagreement === 'diverging';
  return (
    <>
      {diverging && (
        <div style={LOOK.alertPanel}>
          <p data-testid="disagreement" style={LOOK.alertText}>
            {disagreementStatement('diverging', assessment.checkLevel)}
          </p>
        </div>
      )}
      {fix !== null && fix.ok && (
        <FixWordsView
          fix={fix.value}
          assessment={assessment}
          nowUtcMs={nowUtcMs}
          ownPosition={ownPosition}
          parameters={parameters}
        />
      )}
      {fix !== null && !fix.ok && <FailureNotice failure={fix} />}
      {usedCount === 0 && view.incident.entries.length > 0 && (
        <p style={LOOK.readout}>
          None of these sightings is used; the Sightings tab says why each was set aside.
        </p>
      )}
      {usedCount > 0 && (
        <p data-testid="check-statement" style={usedCount === 1 ? LOOK.readout : LOOK.text}>
          {checkStatement(assessment.checkLevel)}
        </p>
      )}
      {usedCount > 0 && <LimitsBlock withFix={fix !== null && fix.ok} />}
      {showAdvice && view.advice !== null && <AdviceView advice={view.advice} />}
    </>
  );
}

export function SmokeScreen({ onSight, onInbox, onPrivacy, modeControl }: SmokeScreenProps) {
  const store = useStore();
  const snapshot = useVigia();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { open, nowUtcMs, inbox, notices, state, ownPosition } = snapshot;
  const others = state.incidents.filter((i) => i.incidentId !== state.openIncidentId);

  const actions = (
    <div style={LOOK.stack}>
      <button type="button" data-primary="true" onClick={onSight} style={LOOK.primaryButton}>
        Sight the smoke
      </button>
      <button type="button" onClick={onInbox} style={LOOK.button}>
        Add a sighting someone sent me{inbox.length > 0 ? ` (${inbox.length} waiting)` : ''}
      </button>
    </div>
  );

  return (
    <section data-testid="smoke-screen" style={LOOK.stack}>
      <p data-testid="not-calling" style={{ ...LOOK.text, fontWeight: 700 }}>
        {NOT_CALLING_TEXT}
      </p>
      {open === null ? (
        <>
          <div style={LOOK.panel}>
            <h1 style={LOOK.title}>No smoke yet</h1>
            <p style={LOOK.text}>{checkStatement('none')}</p>
          </div>
          {actions}
        </>
      ) : (
        <>
          <header data-testid="smoke-header" style={LOOK.stack}>
            <p style={LOOK.dim}>{startedText(open.incident, nowUtcMs)}</p>
            {open.assessment.ok && (
              <p style={LOOK.text}>
                {plural(open.incident.entries.length, 'sighting', 'sightings')},{' '}
                {open.assessment.value.used.length} used
              </p>
            )}
          </header>
          {open.assessment.ok ? (
            <Result
              view={open}
              assessment={open.assessment.value}
              nowUtcMs={nowUtcMs}
              ownPosition={ownPosition}
            />
          ) : (
            <FailureNotice failure={open.assessment} />
          )}
          {actions}
        </>
      )}
      {notices.map((notice) => (
        <FailureNotice
          key={notice.reason}
          failure={{ ok: false, reason: notice.reason }}
          {...(notice.count === undefined ? {} : { count: notice.count })}
        />
      ))}
      {open !== null && <p style={LOOK.dim}>{incidentStatement()}</p>}
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
      <div style={LOOK.stack}>
        {confirmingDelete ? (
          <DeleteAllDialog
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
      </div>
    </section>
  );
}
