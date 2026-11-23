// The Sightings screen (design §9; Req 3.6, 5.1, 5.2, 5.6, 9.5, 15.5): the statement by count,
// then every Sighting of the open smoke in time order, used or set aside with its cause, and any
// conflict with both versions side by side (stacked on a narrow screen).

import { useMemo } from 'react';
import { checkStatement } from '../math/assessment/statements';
import type { SetAsideCause } from '../math/assessment/assess';
import { clockTextUtc } from '../math/civil-time';
import { decodeSighting } from '../math/code/sighting-code';
import { accuracyText, directionText, positionText } from '../math/fix/format';
import { compareIds, type Conflict, type SightingEntry } from '../math/incident/incident-state';
import { FailureNotice } from './FailureNotice';
import { useEnvironment } from './environment';
import { ROLE_VARS } from '@alidade/ui';
import { InlineIcon, NavRow } from './cards/parts';
import { LOOK } from './look';
import { SightingRow } from './SightingRow';
import { useStore, useVigia } from './store';

export interface SightingsScreenProps {
  readonly onShare: (sightingId: string) => void;
  readonly onInbox: () => void;
}

interface Row {
  readonly entry: SightingEntry;
  readonly cause: SetAsideCause | null;
}

function byTimeThenId(a: Row, b: Row): number {
  return (
    a.entry.sighting.bearing.timeUtcMs - b.entry.sighting.bearing.timeUtcMs ||
    compareIds(a.entry.sighting.sightingId, b.entry.sighting.sightingId)
  );
}

function ConflictVersion({ title, code }: { readonly title: string; readonly code: string }) {
  const { parameters } = useEnvironment();
  const decoded = useMemo(() => decodeSighting(code, parameters), [code, parameters]);
  if (!decoded.ok) return <FailureNotice failure={decoded} />;
  const b = decoded.value.bearing;
  const direction = directionText(b.azimuthRad, b.azimuthSigmaRad);
  const accuracy = accuracyText(b.positionAccuracyM);
  const observer = positionText(b.observer, b.positionAccuracyM);
  return (
    <div data-testid="conflict-version" style={LOOK.panel}>
      <h4 style={LOOK.title}>{title}</h4>
      {direction.ok && <p style={LOOK.readout}>Toward {direction.value} (true north)</p>}
      {observer.ok && accuracy.ok && (
        <p style={LOOK.text}>
          Observer at {observer.value.text}, known to {accuracy.value}
        </p>
      )}
      <p style={LOOK.text}>Taken {clockTextUtc(b.timeUtcMs)}</p>
    </div>
  );
}

function ConflictView({ conflict }: { readonly conflict: Conflict }) {
  return (
    <section data-testid="conflict" style={LOOK.stack}>
      <FailureNotice failure={{ ok: false, reason: 'sighting_conflict' }} />
      <ConflictVersion title="Kept on this phone" code={conflict.heldCode} />
      <ConflictVersion title="The other one" code={conflict.otherCode} />
    </section>
  );
}

export function SightingsScreen({ onShare, onInbox }: SightingsScreenProps) {
  const store = useStore();
  const { open, nowUtcMs } = useVigia();
  const addButton = (
    <NavRow icon="inbox" onClick={onInbox}>
      Add a sighting someone sent me
    </NavRow>
  );
  if (open === null) {
    return (
      <section data-testid="sightings-screen" style={LOOK.stack}>
        <div style={LOOK.card}>
          <h1 style={LOOK.title}>No smoke yet</h1>
          <p style={LOOK.text}>{checkStatement('none')}</p>
        </div>
        {addButton}
      </section>
    );
  }
  if (!open.assessment.ok) {
    return (
      <section data-testid="sightings-screen" style={LOOK.stack}>
        <FailureNotice failure={open.assessment} />
      </section>
    );
  }
  const assessment = open.assessment.value;
  const rows: Row[] = [
    ...assessment.used.map((entry) => ({ entry, cause: null })),
    ...assessment.setAside.map((s) => ({ entry: s.entry, cause: s.cause })),
  ].sort(byTimeThenId);
  return (
    <section data-testid="sightings-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Sightings of this smoke</h1>
      {/* The statement by count, as a warning card above the cards (Req 22.7). */}
      <div style={LOOK.statusCard('warning')}>
        <p style={{ ...LOOK.text, color: ROLE_VARS.warnInk }}>
          <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
          {checkStatement(assessment.checkLevel)}
        </p>
      </div>
      <ol style={{ ...LOOK.stack, margin: 0, padding: 0 }}>
        {rows.map((row, index) => {
          const id = row.entry.sighting.sightingId;
          return (
            <SightingRow
              key={id}
              number={index + 1}
              entry={row.entry}
              cause={row.cause}
              nowUtcMs={nowUtcMs}
              onHide={() => store.dispatch({ kind: 'hide', sightingId: id })}
              onShow={() => store.dispatch({ kind: 'show', sightingId: id })}
              onShare={() => onShare(id)}
              onDelete={() => store.dispatch({ kind: 'deleteSighting', sightingId: id })}
            />
          );
        })}
      </ol>
      {open.incident.conflicts.map((conflict) => (
        <ConflictView key={`${conflict.sightingId}:${conflict.otherCode}`} conflict={conflict} />
      ))}
      {addButton}
    </section>
  );
}
