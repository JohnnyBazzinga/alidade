import type { Bearing, Fix, Position } from '@alidade/core';
import type { DeviceRotation, YawReference } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkTileSource } from '../adapters/map/map-adapter';
import { cappedRuns } from '../test-support/fast-check-setup';
import {
  allFinite,
  hostileCalibration,
  hostileNumber,
  hostilePixelSize,
  hostileSourceSize,
  hugeFinite,
  isTotalResult,
} from '../test-support/hostile';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { PARAMETERS, sessionInState } from '../test-support/session-fixtures';
import { eventRateHz } from './diagnostics/event-rate';
import { displayedFocalPx } from './image-geometry';
import { imageLayout, type ImageLayout } from './image-layout';
import { bearingFeatures } from './map/bearing-features';
import { fixFeatures } from './map/fix-features';
import { mapBounds } from './map/map-bounds';
import { buildMapStyle } from './map/map-style';
import { observerFeatures } from './map/observer-features';
import { panelStep, type PanelAction, type PanelState } from './panel/panel-state';
import { aimAfterDrag } from './scene/aim';
import { buildCatalogue } from './scene/catalogue';
import { projectScene } from './scene/project-scene';
import { checkScene, type Station, type SyntheticScene, type Target } from './scene/scene';
import { targetDirection } from './scene/target-direction';
import { liveReadout, steadiness } from './session/readout';
import type { SessionParameters } from './session/parameters';

const RUNS = 10_000;

// Domains. Every number is `hostileNumber()`: NaN, ±Infinity, -0, subnormals, ±MAX_VALUE, the
// doubles either side of every limit of the package, and plain doubles. Strings are arbitrary
// (empty included). Lists hold 0 to 4 items. Nothing is excluded.
const position: fc.Arbitrary<Position> = fc.record({
  latRad: hostileNumber(),
  lonRad: hostileNumber(),
});
const bearing: fc.Arbitrary<Bearing> = fc.record({
  id: fc.string({ maxLength: 8 }),
  observer: position,
  positionAccuracyM: hostileNumber(),
  timeUtcMs: hostileNumber(),
  azimuthRad: hostileNumber(),
  azimuthSigmaRad: hostileNumber(),
});
const fix: fc.Arbitrary<Fix> = fc.record({
  position,
  covariance: fc.record({
    varEastM2: hostileNumber(),
    varNorthM2: hostileNumber(),
    covEastNorthM2: hostileNumber(),
  }),
  ellipse: fc.record({
    semiMajorM: hostileNumber(),
    semiMinorM: hostileNumber(),
    azimuthRad: hostileNumber(),
  }),
  residuals: fc.constant([]),
  iterations: hostileNumber(),
  warnings: fc.constant([]),
  excludedIds: fc.constant([]),
});
const station: fc.Arbitrary<Station> = fc.record({
  id: fc.string({ maxLength: 4 }),
  name: fc.string({ maxLength: 4 }),
  position,
});
const target: fc.Arbitrary<Target> = fc.oneof(
  fc.record({
    kind: fc.constant('landmark' as const),
    id: fc.string({ maxLength: 4 }),
    label: fc.string({ maxLength: 4 }),
    position,
    heightM: hostileNumber(),
  }),
  fc.record({
    kind: fc.constant('sun' as const),
    id: fc.string({ maxLength: 4 }),
    label: fc.string({ maxLength: 4 }),
    azimuthRad: hostileNumber(),
    apparentAltitudeRad: hostileNumber(),
    angularRadiusRad: hostileNumber(),
  }),
);
const scene: fc.Arbitrary<SyntheticScene> = fc.record({
  id: fc.string({ maxLength: 4 }),
  name: fc.string({ maxLength: 4 }),
  calibration: hostileCalibration(),
  stations: fc.array(station, { maxLength: 4 }),
  targets: fc.array(target, { maxLength: 4 }),
});
const rotation: fc.Arbitrary<DeviceRotation> = fc.record({
  alphaRad: hostileNumber(),
  betaRad: hostileNumber(),
  gammaRad: hostileNumber(),
});
const layout: fc.Arbitrary<ImageLayout> = fc
  .tuple(
    hostileSourceSize(),
    hostilePixelSize(),
    fc.constantFrom('cover' as const, 'contain' as const),
  )
  .map(([s, e, fit]) => {
    const l = imageLayout(s, e, fit);
    return l.ok
      ? l.value
      : {
          fit,
          sourceWidthSourcePx: s.widthSourcePx,
          sourceHeightSourcePx: s.heightSourcePx,
          elementWidthPx: e.widthPx,
          elementHeightPx: e.heightPx,
          scalePxPerSourcePx: Number.NaN,
          displayedWidthPx: Number.NaN,
          displayedHeightPx: Number.NaN,
          leftPx: Number.NaN,
          topPx: Number.NaN,
        };
  });
const panelState: fc.Arbitrary<PanelState> = fc.record({
  sceneId: fc.string({ maxLength: 4 }),
  stationId: fc.string({ maxLength: 4 }),
  seed: hostileNumber(),
  speed: fc.constantFrom(0.25 as const, 1 as const, 4 as const),
  playing: fc.boolean(),
  elapsedSimMs: hostileNumber(),
  tickMs: hostileNumber(),
  startUtcMs: hostileNumber(),
});
const panelAction: fc.Arbitrary<PanelAction> = fc.oneof(
  fc.record({
    kind: fc.constant('selectScene' as const),
    sceneId: fc.string({ maxLength: 4 }),
    stationId: fc.string({ maxLength: 4 }),
    startUtcMs: hostileNumber(),
  }),
  fc.record({
    kind: fc.constant('selectStation' as const),
    stationId: fc.string({ maxLength: 4 }),
  }),
  fc.record({ kind: fc.constant('setSeed' as const), seed: hostileNumber() }),
  fc.constantFrom<PanelAction>(
    { kind: 'play' },
    { kind: 'pause' },
    { kind: 'step' },
    { kind: 'restart' },
    { kind: 'tick' },
    { kind: 'setSpeed', speed: 4 },
  ),
);
const yawReference: fc.Arbitrary<YawReference | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    offsetRad: hostileNumber(),
    sigmaRad: hostileNumber(),
    northReference: fc.constantFrom('true' as const, 'magnetic' as const),
    frame: fc.constantFrom('absolute' as const, 'relative' as const),
    establishedUtcMs: hostileNumber(),
  }),
);
/** The Session parameters with one field replaced by a hostile number. */
const parameters: fc.Arbitrary<SessionParameters> = fc
  .tuple(
    fc.constantFrom(
      ...(Object.keys(PARAMETERS) as (keyof SessionParameters)[]).filter(
        (k) => typeof PARAMETERS[k] === 'number',
      ),
    ),
    hostileNumber(),
  )
  .map(([field, value]) => ({ ...PARAMETERS, [field]: value }));
const tiles = fc.record({
  tileUrlTemplates: fc.array(fc.oneof(fc.string(), fc.constant('https://t/{z}/{x}/{y}.png')), {
    maxLength: 3,
  }),
  attribution: fc.string({ maxLength: 8 }),
  minZoom: hostileNumber(),
  maxZoom: hostileNumber(),
  tileSizePx: hostileNumber(),
});

/** A live Session's history: real samples, so that the readout gets past its first step. */
const LIVE = sessionInState('live', 'bearing').session;

// P-2.6 (Req 2.1, 2.6), the functions of tasks 16 to 19 and the readout: every public function of
// the map geometry, the synthetic scene, the aim, the panel, the diagnostics and the Live readout,
// given hostile type-correct input, returns without throwing, and every number reachable in its
// result is finite. `buildMapStyle` takes only a checked Tile source (the Map adapter checks it
// with `checkTileSource` first), and is held here on what `checkTileSource` accepts.
describe('P-2.6 the Math layer of tasks 16 to 19 is total', () => {
  it('map geometry, scene, aim, panel, diagnostics and readout', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.6 map, scene, panel, readout',
      fc.property(
        fc.record({
          observers: fc.array(fc.record({ id: fc.string({ maxLength: 4 }), position }), {
            maxLength: 4,
          }),
          bearing,
          fix,
          lineLengthM: hostileNumber(),
          arcStepRad: hostileNumber(),
          vertexCount: hostileNumber(),
          scene,
          station,
          target,
          rotation,
          layout,
          calibration: hostileCalibration(),
          pose: fc.record({
            azimuthRad: hostileNumber(),
            apparentAltitudeRad: hostileNumber(),
            rollRad: hostileNumber(),
          }),
          drag: fc.tuple(hostileNumber(), hostileNumber(), hostileNumber()),
          panelState,
          panelAction,
          times: fc.array(hostileNumber(), { maxLength: 6 }),
          end: hostileNumber(),
          window: hostileNumber(),
          yawReference,
          declination: fc.oneof(
            fc.constant(null),
            fc.record({ declinationRad: hostileNumber(), sigmaRad: hostileNumber() }),
          ),
          parameters,
          spread: fc.oneof(fc.constant(null), hostileNumber()),
          tiles,
        }),
        (c) => {
          const lines = bearingFeatures(c.bearing, c.lineLengthM, c.arcStepRad);
          const ring = fixFeatures(c.fix, c.vertexCount);
          const collections = [lines, ring].flatMap((r) => (r.ok ? [r.value] : []));
          const checkedTiles = checkTileSource(c.tiles);
          const results: unknown[] = [
            observerFeatures(c.observers),
            lines,
            ring,
            mapBounds(collections),
            checkedTiles,
            checkScene(c.scene),
            targetDirection(c.station, c.target),
            projectScene(c.scene, c.station, c.rotation, c.layout),
            aimAfterDrag(c.pose, c.drag[0], c.drag[1], c.drag[2]),
            panelStep(c.panelState, c.panelAction),
            displayedFocalPx(c.layout, c.calibration),
          ];
          const rate = eventRateHz(c.times, c.end, c.window);
          const readout = liveReadout(
            LIVE.history,
            c.yawReference,
            c.declination,
            c.parameters,
            c.end,
          );
          const level = steadiness(c.spread, c.parameters);
          const style = checkedTiles.ok ? buildMapStyle(checkedTiles.value) : buildMapStyle(null);
          const good =
            results.every(isTotalResult) &&
            Number.isFinite(rate) &&
            allFinite(readout) &&
            ['steady', 'settling', 'unsteady'].includes(level) &&
            allFinite(style);
          tracker.record('non-total results (must be 0)', good ? 0 : 1, '0');
          return good;
        },
      ),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
  });

  // P-2.6 for the panel (Req 2.6, 17.5): a valid state and an action that advances the clock, with
  // one field (or the whole state) hostile. A fully hostile state almost never passes the seed
  // check, which comes first, so on its own it hardly ever reaches the tick length: this is why
  // the unbounded list of advances hid from 200 cases (design D30). Every call must also be fast:
  // the slowest is reported, and a call over a second fails, which no bounded panel step comes
  // near (they take microseconds) and every unbounded one passes.
  it('panelStep is total and bounded on states one field away from valid', () => {
    const tracker = new ErrorTracker();
    let reached = 0;
    let slowestMs = 0;
    // Domain: the field is drawn with weights tickMs 3, elapsedSimMs 2, startUtcMs 1, seed 1; its
    // value is `hostileNumber()` or, half the time, `hugeFinite()`; for a tick the state plays and
    // for a step it is paused, so that the action reaches the advance. One case in five is the
    // fully hostile state and any action.
    const field = fc.oneof(
      { weight: 3, arbitrary: fc.constant('tickMs' as const) },
      { weight: 2, arbitrary: fc.constant('elapsedSimMs' as const) },
      { weight: 1, arbitrary: fc.constant('startUtcMs' as const) },
      { weight: 1, arbitrary: fc.constant('seed' as const) },
    );
    const nearValid: fc.Arbitrary<[PanelState, PanelAction]> = fc
      .tuple(
        field,
        fc.oneof(hostileNumber(), hugeFinite()),
        fc.constantFrom(0.25 as const, 1 as const, 4 as const),
        fc.constantFrom<PanelAction>({ kind: 'tick' }, { kind: 'step' }),
      )
      .map(([name, value, speed, action]) => [
        {
          sceneId: 's',
          stationId: 'a',
          seed: 1,
          speed,
          playing: action.kind === 'tick',
          elapsedSimMs: 0,
          tickMs: 100,
          startUtcMs: 1_790_000_000_000,
          [name]: value,
        },
        action,
      ]);
    const cases = fc.oneof(
      { weight: 4, arbitrary: nearValid },
      { weight: 1, arbitrary: fc.tuple(panelState, panelAction) },
    );
    checkProperty(
      'P-2.6 panelStep',
      fc.property(cases, ([state, action]) => {
        const runs =
          (action.kind === 'tick' && state.playing) || (action.kind === 'step' && !state.playing);
        // The old bug's path: the checks before the advance passed and the tick would be long.
        if (
          runs &&
          Number.isInteger(state.seed) &&
          state.seed >= 0 &&
          state.seed < 2 ** 32 &&
          Number.isFinite(state.tickMs) &&
          state.tickMs * state.speed > 3_600_000 &&
          Number.isFinite(state.elapsedSimMs) &&
          state.elapsedSimMs >= 0 &&
          Number.isFinite(state.startUtcMs)
        ) {
          reached += 1;
        }
        const t0 = performance.now();
        const r = panelStep(state, action);
        const ms = performance.now() - t0;
        slowestMs = Math.max(slowestMs, ms);
        const good =
          isTotalResult(r) && ms < 1000 && (!r.ok || r.value.advancesToUtcMs.length <= 1);
        tracker.record('non-total, slow or long results (must be 0)', good ? 0 : 1, '0');
        return good;
      }),
      tracker,
      { numRuns: cappedRuns(RUNS) },
    );
    console.log(
      `[coverage] P-2.6 panelStep: ${reached} cases on the path of the old bug (a long tick that would run); slowest call ${slowestMs.toFixed(3)} ms`,
    );
    expect(reached).toBeGreaterThan(0);
  });

  it('buildCatalogue is total', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.6 buildCatalogue',
      fc.property(fc.constant(null), () => {
        const good = isTotalResult(buildCatalogue());
        tracker.record('non-total results (must be 0)', good ? 0 : 1, '0');
        return good;
      }),
      tracker,
      { numRuns: cappedRuns(200) },
    );
  });
});
