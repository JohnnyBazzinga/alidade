// The shape of an Overlay (design §6, D15; Req 1.10, 12, 13, 18.4): plain types only. An Overlay
// is a definition that creates a controller, a small observable of plain state that the Map screen
// reads through the Overlay panel. Nothing outside `src/overlays/` but `App.tsx` and
// `overlays-empty.ts` imports this module.

import type { Position } from '@alidade/core';
import type { AppLayer } from '@alidade/ui';
import type { VigiaParameters } from '../../../math/parameters';
import type { Unsubscribe } from '../../../math/transport/transport';
import type { VigiaFailure, VigiaResult } from '../../../result';

/** One drawing of an Overlay on the map, named with its Source and the time of its data (Req 18.4). */
export interface LegendEntry {
  readonly label: string;
  readonly sourceName: string;
  readonly timeUtcMs: number | null;
}

/** A Source of an Overlay's data, named once the Overlay is on (Req 13.1). */
export interface OverlaySource {
  readonly name: string;
  readonly attribution: string;
  /** The terms, shown as text: the app sets no `href` that leaves the page (Req 11.1). */
  readonly termsUrl: string;
}

export interface OverlayState {
  readonly id: string;
  readonly enabled: boolean;
  readonly status: 'off' | 'loading' | 'ready' | 'failed';
  readonly failure: VigiaFailure | null;
  readonly layers: readonly AppLayer[];
  readonly legend: readonly LegendEntry[];
  readonly words: readonly string[];
  readonly fetchedUtcMs: number | null;
}

export interface OverlayContext {
  readonly observers: readonly Position[];
  readonly fix: Position | null;
  readonly lineLengthM: number;
}

export interface OverlayController {
  getState(): OverlayState;
  subscribe(listener: () => void): Unsubscribe;
  /** The user's act. */
  setEnabled(enabled: boolean): void;
  /** The user's act; never a timer (Req 13.7). */
  refresh(): void;
  /** New observers or Fix: the layers are computed again, with no request. */
  update(context: OverlayContext): void;
}

/** The Network gate as an Overlay sees it (the Adapter's `NetworkGate`; the Math layer names no Adapter). */
export interface OverlayGate {
  get(url: string): Promise<VigiaResult<string>>;
}

export interface OverlayDeps {
  readonly gate: OverlayGate;
  readonly clock: () => number;
  readonly parameters: VigiaParameters;
  readonly mode: 'device' | 'simulation';
}

export interface OverlayDefinition {
  readonly id: string;
  readonly title: string;
  /** What will be sent, to whom, and what it carries: said before the first use (Req 13.1, 12.1). */
  readonly sends: string;
  readonly sources: readonly OverlaySource[];
  create(deps: OverlayDeps): OverlayController;
}
