// The Smoke screen, the first screen (design §9, D23, D26.3; Req 4.5, 4.11, 4.12, 5.4, 5.5, 6.12, 7.2
// to 7.5, 14.5, 16.1, 17.1), in Mira's order. With no smoke: the title "Nothing on the horizon", the
// dial whose yellow button is "Sight the smoke", the smoke's state in small capitals, two tiles (add
// a sighting someone sent; this phone's data and mode) and the not-calling statement. With a smoke:
// right after a capture the dial of the saved bearing and its numeral; the smoke's state and, with
// one sighting, "One sighting gives a direction, not a place." as its title; the position with its
// 95 % radius when there is one, every warning that applies, where to sight from next; "Sight the
// smoke"; the Inbox; "Details and limits" and "Data and mode" as two tiles that open in place; the
// not-calling statement; and the primary action above the tabs, "Sight the smoke" or, right after a
// capture, "Send this sighting".
import { useState, type ReactNode } from 'react';
import {
  checkStatement,
  disagreementStatement,
  incidentStatement,
} from '../math/assessment/statements';
import type { Assessment } from '../math/assessment/assess';
import { ageText, clockTextUtc } from '../math/civil-time';
import { directionText, savedLineText } from '../math/fix/format';
import type { Incident } from '../math/incident/incident-state';
import {
  COMPASS_ONE_LINE_TEXT,
  HOME_LEAD,
  HOME_TITLE,
  NOT_CALLING_TEXT,
  smokeStateCaption,
} from '../math/texts';
import { AdviceView } from './AdviceView';
import { DeleteAllDialog } from './DeleteAllDialog';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { FixWordsView } from './FixWordsView';
import { LimitsBlock } from './LimitsBlock';
import { Icon, ROLE_VARS } from '@alidade/ui';
import { BearingDial, HomeDial } from './art/Dials';
import { HeadlineFirst, InlineIcon, NavRow } from './cards/parts';
import { LOOK, SHAPE } from './look';
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
  // With one sighting the sentence is the screen's title (Mira), not a card.
  const checkCard = checkInFirst && usedCount !== 1;
  const advice = showAdvice && view.advice !== null ? <AdviceView advice={view.advice} /> : null;

  const first = (
    <>
      {diverging && (
        <div style={LOOK.alertPanel}>
          <p data-testid="disagreement" style={LOOK.alertText}>
            <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
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
        <div style={LOOK.statusCard('warning')}>
          <p style={LOOK.alertText}>
            <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
            None of these sightings is used; the Sightings tab says why each was set aside.
          </p>
        </div>
      )}
      {/* The sentence for one, two or three sightings is the warning of the state (Req 22.6). */}
      {checkCard && (
        <div style={LOOK.statusCard('warning')}>
          <p data-testid="check-statement" style={{ ...LOOK.text, color: ROLE_VARS.warnInk }}>
            <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
            {checkStatement(level)}
          </p>
        </div>
      )}
      {fixOk && onShowMap !== undefined && (
        <button type="button" onClick={onShowMap} style={LOOK.button}>
          <Icon name="map" />
          Show on map
        </button>
      )}
      {/* No Fix: where to sight from next is what the user needs (Req 7.4, 7.5). */}
      {!fixOk && advice}
      {usedCount > 0 && (
        <p
          style={{
            ...LOOK.dim,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 4px',
          }}
        >
          <Icon name="compass" style={{ width: 20, height: 20, color: ROLE_VARS.inkDim }} />
          {COMPASS_ONE_LINE_TEXT}
        </p>
      )}
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

/** A tile of two lines (Mira): a small line that says what it is for, a bold line that says it. */
function TwoLineTile({
  small,
  big,
  onClick,
  expanded,
  testId,
  label,
}: {
  readonly small: string;
  readonly big: string;
  readonly onClick: () => void;
  readonly expanded?: boolean;
  readonly testId?: string;
  /** The control's name, where the two lines say it in another order. */
  readonly label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(label === undefined ? {} : { 'aria-label': label })}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      style={{
        ...LOOK.tile,
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 2,
        minHeight: 60,
        padding: '6px 14px',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 400, color: ROLE_VARS.inkDim }}>{small}</span>
      <span>{big}</span>
    </button>
  );
}

/** A tile that opens in place (Mira's "Details and limits"), its chevron saying whether it is open. */
function OpenTile({
  label,
  open,
  onClick,
}: {
  readonly label: string;
  readonly open: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      style={{ ...LOOK.tile, justifyContent: 'space-between', minHeight: 60, padding: '6px 14px' }}
    >
      <span>{label}</span>
      <Icon
        name="chevron-down"
        style={{
          width: 14,
          height: 14,
          color: ROLE_VARS.inkDim,
          transform: open ? 'rotate(180deg)' : 'none',
        }}
      />
    </button>
  );
}

/** The bearing just saved (Mira): its dial, "Sighting saved", the numeral and its 1-sigma. */
function SavedHead({
  azimuthRad,
  sigmaRad,
}: {
  readonly azimuthRad: number;
  readonly sigmaRad: number;
}) {
  const line = savedLineText(azimuthRad, sigmaRad);
  const direction = directionText(azimuthRad, sigmaRad);
  if (!line.ok || !direction.ok) return null;
  // "33.4° ± 2.1°": the numeral, and its 1-sigma under it.
  const [numeral = '', sigma = ''] = direction.value.split(' ± ');
  return (
    <section
      data-testid="saved-head"
      style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
    >
      <BearingDial
        azimuthRad={azimuthRad}
        sizePx={150}
        face
        label={`Compass dial with the saved direction, ${numeral.replace('°', '')} degrees`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {/* The words of Req 4.11, in small capitals; the numeral says the direction again. */}
        <p
          data-testid="status-line"
          aria-label={line.value}
          style={{
            ...LOOK.caption,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: ROLE_VARS.okInk,
          }}
        >
          <Icon name="check" style={{ width: 14, height: 14 }} />
          Sighting saved
        </p>
        <p style={{ ...LOOK.numeral, fontSize: 54, letterSpacing: '-2px' }}>{numeral}</p>
        <p style={{ ...LOOK.caption, fontSize: 13, letterSpacing: 0 }}>{`± ${sigma} · true`}</p>
      </div>
    </section>
  );
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
  const [dataOpen, setDataOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { open, nowUtcMs, inbox, notices, state, ownPosition } = snapshot;
  const others = state.incidents.filter((i) => i.incidentId !== state.openIncidentId);
  const savedEntry =
    saved === undefined
      ? undefined
      : state.incidents
          .flatMap((i) => i.entries)
          .find((e) => e.sighting.sightingId === saved.sightingId);
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
  const usedCount = open !== null && open.assessment.ok ? open.assessment.value.used.length : 0;
  const located =
    open !== null &&
    open.assessment.ok &&
    open.assessment.value.fix !== null &&
    open.assessment.value.fix.ok;
  // Right after a capture, "Send this sighting" is the primary action and this one is secondary.
  const sendIsPrimary = saved !== undefined && savedEntry !== undefined;
  const sightButton = (
    <button
      type="button"
      {...(!sendIsPrimary ? { 'data-primary': 'true' } : {})}
      onClick={onSight}
      style={
        !sendIsPrimary
          ? LOOK.primaryButton
          : { ...LOOK.button, minHeight: 56, fontSize: 17, fontWeight: 800, flex: '0 0 auto' }
      }
    >
      <Icon name="crosshair" />
      Sight the smoke
    </button>
  );
  const modeWord = environment.mode === 'simulation' ? 'Simulator' : 'This phone';
  // A panel that is closed is kept in the page, hidden, as a closed `details` keeps its contents.
  const dataPanel = (
    <section
      data-testid="data-and-mode"
      data-disclosure={`This phone's data and mode: ${modeWord}`}
      aria-label={`This phone's data and mode: ${modeWord}`}
      hidden={!dataOpen}
      style={dataOpen ? LOOK.card : { display: 'none' }}
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
          <Icon name="trash" />
          Delete everything on this phone
        </button>
      )}
      <button type="button" onClick={onPrivacy} style={LOOK.button}>
        What leaves this phone
      </button>
      {modeControl}
    </section>
  );
  const dataTile = (
    <TwoLineTile
      small="Data and mode"
      big={modeWord}
      expanded={dataOpen}
      testId="data-tile"
      onClick={() => setDataOpen((o) => !o)}
    />
  );

  return (
    <section data-testid="smoke-screen" style={LOOK.stack}>
      {statusLine !== undefined && (
        <div style={LOOK.statusCard('info')}>
          <p data-testid="status-line" style={{ ...LOOK.text, color: ROLE_VARS.infoInk }}>
            <InlineIcon name="info" colour={ROLE_VARS.infoIcon} />
            {statusLine}
          </p>
        </div>
      )}
      {savedEntry !== undefined && (
        <SavedHead
          azimuthRad={savedEntry.sighting.bearing.azimuthRad}
          sigmaRad={savedEntry.sighting.bearing.azimuthSigmaRad}
        />
      )}
      {open === null ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1
              data-testid="home-title"
              style={{ ...LOOK.title, fontSize: 34, lineHeight: 1.05, letterSpacing: '-1.2px' }}
            >
              {HOME_TITLE}
            </h1>
            <p style={{ ...LOOK.dim, fontSize: 15 }}>{HOME_LEAD}</p>
          </div>
          <HomeDial onSight={onSight} />
          <p data-testid="smoke-state" style={{ ...LOOK.caption, textAlign: 'center' }}>
            {smokeStateCaption(0, false)}
          </p>
          <div style={LOOK.pair}>
            <TwoLineTile
              small="Someone sent me one"
              big={inbox.length > 0 ? `Add a sighting (${inbox.length} waiting)` : 'Add a sighting'}
              label={`Add a sighting someone sent me${inbox.length > 0 ? ` (${inbox.length} waiting)` : ''}`}
              onClick={onInbox}
            />
            {dataTile}
          </div>
          {dataPanel}
          {reviewerPath}
        </>
      ) : (
        <>
          {open.assessment.ok && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
              <p data-testid="smoke-state" style={LOOK.caption}>
                {smokeStateCaption(usedCount, located)}
              </p>
              {usedCount === 1 && !located && (
                <h1
                  data-testid="check-statement"
                  style={{ ...LOOK.title, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.7px' }}
                >
                  {checkStatement('one')}
                </h1>
              )}
            </div>
          )}
          {open.assessment.ok ? parts?.first : <FailureNotice failure={open.assessment} />}
          {sendIsPrimary && sightButton}
          <NavRow icon="inbox" onClick={onInbox}>
            Add a sighting someone sent me{inbox.length > 0 ? ` (${inbox.length} waiting)` : ''}
          </NavRow>
        </>
      )}
      {notices.map((notice) => (
        <FailureNotice
          key={notice.reason}
          failure={{ ok: false, reason: notice.reason }}
          {...(notice.count === undefined ? {} : { count: notice.count })}
        />
      ))}
      {open !== null && (
        <>
          <div style={LOOK.pair}>
            <OpenTile
              label="Details and limits"
              open={detailsOpen}
              onClick={() => setDetailsOpen((o) => !o)}
            />
            {dataTile}
          </div>
          {
            <section
              data-testid="details-and-limits"
              data-disclosure="Details and limits"
              hidden={!detailsOpen}
              style={detailsOpen ? LOOK.card : { display: 'none' }}
            >
              <p style={LOOK.dim}>{startedText(open.incident, nowUtcMs)}</p>
              {open.assessment.ok && (
                <p style={LOOK.text}>
                  {plural(open.incident.entries.length, 'sighting', 'sightings')},{' '}
                  {open.assessment.value.used.length} used
                </p>
              )}
              {parts?.details}
            </section>
          }
          {dataPanel}
        </>
      )}
      {others.length > 0 && (
        <section data-testid="other-smokes" style={LOOK.card}>
          <h2 style={LOOK.cardTitle}>Other smokes on this phone</h2>
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
      {/* The not-calling statement (Req 14.5, 22.6): the app calls no one. */}
      <p
        role="note"
        data-testid="not-calling"
        style={{
          ...LOOK.text,
          fontSize: 13,
          lineHeight: 1.4,
          padding: '10px 14px',
          borderRadius: SHAPE.tileRadius,
          background: ROLE_VARS.dangerTint,
          color: ROLE_VARS.dangerInk,
        }}
      >
        <HeadlineFirst text={NOT_CALLING_TEXT} />
      </p>
      {open !== null && (
        <PrimaryAction>
          {sendIsPrimary && savedEntry !== undefined ? (
            <button
              type="button"
              data-primary="true"
              onClick={() => onSend?.(savedEntry.sighting.sightingId)}
              style={LOOK.primaryButton}
            >
              <Icon name="send" />
              Send this sighting
            </button>
          ) : (
            sightButton
          )}
        </PrimaryAction>
      )}
    </section>
  );
}
