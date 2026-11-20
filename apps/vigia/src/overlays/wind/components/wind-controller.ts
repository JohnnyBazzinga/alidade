// The wind Overlay's controller (design §7.16, D15; Req 13.1, 13.2, 13.7, 17.4): a small observable of
// plain state. It is off at start. A request is made only when the user switches it on or presses
// Refresh: never by a timer, never by an update. `update` gives it the observers and the Fix again
// and recomputes the arrow with no request. A failure shows its Message and leaves no layer. In
// Simulation mode it reads the synthetic fixture and never calls the Network gate; it still applies
// the Host list's decision to the request it would have made, so that a request the gate would
// refuse is refused here too.

import type { Position } from '@alidade/core';
import type { AppLayer } from '@alidade/ui';
import { decideRequest } from '../../../math/network/gate-decision';
import { HOST_LIST, WIND_ENTRY } from '../../../math/network/host-list';
import { windRequestUrl } from '../../../math/network/request-boxes';
import { err, ok, type VigiaFailure, type VigiaResult } from '../../../result';
import type {
  LegendEntry,
  OverlayContext,
  OverlayController,
  OverlayDeps,
  OverlayState,
} from '../../shared/math/overlay-types';
import SIMULATION_RESPONSE from '../../../../fixtures/open-meteo-sample.json?raw';
import { observersMidpoint, windLayers } from '../math/wind-features';
import { parseWindResponse, windPointPosition, type WindReading } from '../math/wind-parse';
import { windTiming, windWords } from '../math/wind-words';

const LEGEND_LABEL =
  'Wind arrow: the direction the wind blows to, from a model, not a measurement.';
const NO_SMOKE_WORDS =
  'There is no smoke with a sighting to ask the wind for. Sight the smoke, then press Refresh.';
const READY_WORDS = 'There is a smoke on the map now. Press Refresh to ask for its wind.';
const MOVED_WORDS =
  'The smoke is now in another place than when this reading was asked for; press Refresh for the wind there.';

const NO_CONTEXT: OverlayContext = { observers: [], fix: null, clearRadiusM: 0, lineLengthM: 5000 };

const OFF: OverlayState = Object.freeze({
  id: 'wind',
  enabled: false,
  status: 'off',
  failure: null,
  layers: [],
  legend: [],
  words: [],
  fetchedUtcMs: null,
});

interface Anchor {
  readonly anchor: Position;
  readonly clearRadiusM: number;
}

/** The Fix, or with none the midpoint of the observers; `null` when there is neither. */
function anchorOf(context: OverlayContext): VigiaResult<Anchor> | null {
  if (context.fix !== null) return ok({ anchor: context.fix, clearRadiusM: context.clearRadiusM });
  if (context.observers.length === 0) return null;
  const midpoint = observersMidpoint(context.observers);
  return midpoint.ok ? ok({ anchor: midpoint.value, clearRadiusM: 0 }) : midpoint;
}

const SAME_POINT_RAD = 1e-9;

export function createWindController(deps: OverlayDeps): OverlayController {
  const { gate, clock, parameters, mode } = deps;
  const listeners = new Set<() => void>();

  let enabled = false;
  let status: OverlayState['status'] = 'off';
  let failure: VigiaFailure | null = null;
  let reading: WindReading | null = null;
  let fetchedUtcMs: number | null = null;
  let context: OverlayContext = NO_CONTEXT;
  /** Switched on with nothing yet asked: the words say what to do. */
  let idle = false;
  let requestId = 0;
  let state: OverlayState = OFF;

  function build(): OverlayState {
    if (!enabled) return OFF;
    const anchor = anchorOf(context);
    const words: string[] = [];
    let layers: readonly AppLayer[] = [];
    const legend: LegendEntry[] = [];
    let shownFailure = failure;

    if (reading !== null) {
      const sentences = windWords(reading, clock(), parameters);
      if (sentences.ok) words.push(...sentences.value);
      if (
        windTiming(reading.validUtcMs, clock(), parameters) !== 'current' &&
        shownFailure === null
      ) {
        shownFailure = err('overlay_stale');
      }
      if (anchor !== null && anchor.ok) {
        const drawn = windLayers(reading, {
          anchor: anchor.value.anchor,
          clearRadiusM: anchor.value.clearRadiusM,
          lineLengthM: context.lineLengthM,
          observers: context.observers,
        });
        if (drawn.ok) {
          layers = drawn.value;
          legend.push({
            label: LEGEND_LABEL,
            sourceName: WIND_ENTRY.sourceName,
            timeUtcMs: reading.validUtcMs,
          });
        } else if (shownFailure === null) {
          shownFailure = drawn;
        }
        const now = windPointPosition(anchor.value.anchor, parameters);
        if (
          now.ok &&
          (Math.abs(now.value.latRad - reading.point.latRad) > SAME_POINT_RAD ||
            Math.abs(now.value.lonRad - reading.point.lonRad) > SAME_POINT_RAD)
        ) {
          words.push(MOVED_WORDS);
        }
      }
    } else if (idle) {
      words.push(anchor === null ? NO_SMOKE_WORDS : READY_WORDS);
    }
    return {
      id: 'wind',
      enabled,
      status,
      failure: shownFailure,
      layers,
      legend,
      words,
      fetchedUtcMs,
    };
  }

  function publish(): void {
    state = build();
    for (const listener of [...listeners]) listener();
  }

  function fail(mine: number, failed: VigiaFailure): void {
    if (mine !== requestId || !enabled) return;
    reading = null;
    fetchedUtcMs = null;
    idle = false;
    failure = failed;
    status = 'failed';
    publish();
  }

  function finish(mine: number, response: VigiaResult<string>, point: Position): void {
    if (mine !== requestId || !enabled) return;
    if (!response.ok) return fail(mine, response);
    const parsed = parseWindResponse(response.value, point, parameters);
    if (!parsed.ok) return fail(mine, parsed);
    reading = parsed.value;
    fetchedUtcMs = clock();
    idle = false;
    failure = null;
    status = 'ready';
    publish();
  }

  function start(): void {
    requestId += 1;
    const mine = requestId;
    const anchor = anchorOf(context);
    if (anchor === null) {
      reading = null;
      fetchedUtcMs = null;
      failure = null;
      idle = true;
      status = 'ready';
      publish();
      return;
    }
    if (!anchor.ok) return fail(mine, anchor);
    const url = windRequestUrl(anchor.value.anchor, parameters);
    if (!url.ok) return fail(mine, url);
    const point = windPointPosition(anchor.value.anchor, parameters);
    if (!point.ok) return fail(mine, point);

    idle = false;
    failure = null;
    status = 'loading';
    publish();
    if (mode === 'simulation') {
      const decision = decideRequest(url.value, HOST_LIST);
      finish(mine, decision.ok ? ok(SIMULATION_RESPONSE) : decision, point.value);
      return;
    }
    void gate.get(url.value).then((response) => finish(mine, response, point.value));
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setEnabled(next) {
      if (next === enabled) return;
      requestId += 1;
      enabled = next;
      if (next) {
        start();
        return;
      }
      status = 'off';
      failure = null;
      reading = null;
      fetchedUtcMs = null;
      idle = false;
      publish();
    },
    refresh() {
      if (enabled) start();
    },
    update(next) {
      context = next;
      if (enabled && (reading !== null || idle)) publish();
    },
  };
}
