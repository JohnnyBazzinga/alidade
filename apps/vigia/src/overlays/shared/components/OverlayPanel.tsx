// The Overlays panel of the Map screen (design §9, D15; Req 1.10, 13.1, 13.7, 18.4), read
// generically from the registered definitions. `useOverlaySlot` creates one controller for each
// definition, keeps them told of the observers and the Fix (no request: only the user's switch and
// Refresh ask for data), and gives the Map screen their layers, their legend and this panel. With
// no definition there is no panel.

import { ellipse95 } from '@alidade/core';
import { COLOURS, ROLE_VARS } from '@alidade/ui';
import { useEffect, useMemo, useState } from 'react';
import { ageText, clockTextUtc } from '../../../math/civil-time';
import { mapModel } from '../../../math/fix/map-model';
import { FailureNotice } from '../../../components/FailureNotice';
import { LOOK } from '../../../components/look';
import type { OverlaySlot } from '../../../components/MapScreen';
import type { OpenView } from '../../../components/store';
import type {
  OverlayContext,
  OverlayController,
  OverlayDefinition,
  OverlayDeps,
  OverlayState,
} from '../math/overlay-types';
import { Legend } from './Legend';
import { SourcesList } from './SourcesList';

interface Item {
  readonly definition: OverlayDefinition;
  readonly controller: OverlayController;
  readonly state: OverlayState;
}

const NO_CONTEXT: OverlayContext = { observers: [], fix: null, clearRadiusM: 0, lineLengthM: 5000 };

/** What an Overlay is told of the open smoke: its observers, its Fix, the clear circle and the lines. */
export function contextOf(open: OpenView | null, deps: OverlayDeps): OverlayContext {
  if (open === null || !open.assessment.ok) return NO_CONTEXT;
  const model = mapModel(open.assessment.value, deps.parameters);
  if (!model.ok) return NO_CONTEXT;
  // What an Overlay must keep clear of: the circle that holds the Fix's 95 % ellipse.
  const ellipse = model.value.fix === null ? null : ellipse95(model.value.fix.ellipse);
  return {
    observers: open.assessment.value.used.map((e) => e.sighting.bearing.observer),
    fix: model.value.fix?.position ?? null,
    clearRadiusM: ellipse !== null && ellipse.ok ? ellipse.value.semiMajorM : 0,
    lineLengthM: model.value.lineLengthM,
  };
}

function OverlayItem({ item, nowUtcMs }: { readonly item: Item; readonly nowUtcMs: number }) {
  const { definition, controller, state } = item;
  return (
    <div data-testid={`overlay-${definition.id}`} style={LOOK.stack}>
      <button
        type="button"
        role="switch"
        aria-checked={state.enabled}
        aria-label={definition.title}
        onClick={() => controller.setEnabled(!state.enabled)}
        style={{
          ...LOOK.tile,
          gap: 12,
          minHeight: 56,
          padding: '0 14px 0 16px',
          border: 'none',
          background: ROLE_VARS.raised,
          fontSize: 16,
        }}
      >
        {/* Mira's switch: the title, the state in words, and a track whose knob says it too. */}
        <span style={{ flex: '1 1 auto' }}>{definition.title}</span>
        <span style={{ fontSize: 14, fontWeight: 400, color: COLOURS.inkDim }}>
          {state.enabled ? 'On' : 'Off'}
        </span>
        <span
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: state.enabled ? 'flex-end' : 'flex-start',
            flex: '0 0 auto',
            boxSizing: 'border-box',
            width: 50,
            height: 30,
            padding: 3,
            borderRadius: 15,
            border: `1.5px solid ${ROLE_VARS.ink}`,
            background: state.enabled ? ROLE_VARS.primary : ROLE_VARS.card,
          }}
        >
          <span style={{ width: 21, height: 21, borderRadius: '50%', background: ROLE_VARS.ink }} />
        </span>
      </button>
      {state.failure !== null && <FailureNotice failure={state.failure} />}
      {!state.enabled && state.fetchedUtcMs === null && (
        <p style={{ ...LOOK.dim, fontSize: 13, lineHeight: 1.55 }}>{definition.sends}</p>
      )}
      {state.enabled && (
        <>
          {state.status === 'loading' && <p style={LOOK.dim}>Asking for the data.</p>}
          {state.words.map((w) => (
            <p key={w} style={LOOK.text}>
              {w}
            </p>
          ))}
          {state.fetchedUtcMs !== null && (
            <p style={LOOK.dim}>
              Fetched {clockTextUtc(state.fetchedUtcMs)}, {ageText(nowUtcMs - state.fetchedUtcMs)}.
            </p>
          )}
          <SourcesList sources={definition.sources} />
          <button
            type="button"
            aria-label={`Refresh ${definition.title}`}
            onClick={() => controller.refresh()}
            style={LOOK.button}
          >
            Refresh
          </button>
        </>
      )}
    </div>
  );
}

export function OverlayPanel({
  items,
  nowUtcMs,
}: {
  readonly items: readonly Item[];
  readonly nowUtcMs: number;
}) {
  return (
    <section data-testid="overlay-panel" style={{ ...LOOK.card, gap: 12 }}>
      <h2 style={LOOK.cardTitle}>Extra map information</h2>
      {items.map((item) => (
        <OverlayItem key={item.definition.id} item={item} nowUtcMs={nowUtcMs} />
      ))}
    </section>
  );
}

/** The Overlays' part of the Map screen, or `null` when no Overlay is registered. */
export function useOverlaySlot(
  definitions: readonly OverlayDefinition[],
  deps: OverlayDeps,
  open: OpenView | null,
): OverlaySlot | null {
  const { gate, clock, parameters, mode } = deps;
  const controllers = useMemo(
    () =>
      definitions.map((definition) => ({
        definition,
        controller: definition.create({ gate, clock, parameters, mode }),
      })),
    [definitions, gate, clock, parameters, mode],
  );
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const offs = controllers.map((c) => c.controller.subscribe(() => setVersion((v) => v + 1)));
    return () => {
      for (const off of offs) off();
    };
  }, [controllers]);
  const context = useMemo(
    () => contextOf(open, { gate, clock, parameters, mode }),
    [open, gate, clock, parameters, mode],
  );
  useEffect(() => {
    for (const c of controllers) c.controller.update(context);
  }, [controllers, context]);
  return useMemo(() => {
    if (controllers.length === 0) return null;
    void version;
    const items = controllers.map((c) => ({ ...c, state: c.controller.getState() }));
    return {
      layers: items.flatMap((i) => i.state.layers),
      legend: <Legend entries={items.flatMap((i) => i.state.legend)} />,
      panel: <OverlayPanel items={items} nowUtcMs={clock()} />,
      // Req 13.5: the sighting guidance reminds that smoke drifts downwind while a reading is shown.
      windShown: items.some(
        (i) => i.definition.id === 'wind' && i.state.enabled && i.state.layers.length > 0,
      ),
    };
  }, [controllers, version, clock]);
}
