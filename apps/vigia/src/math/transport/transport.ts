// The Transport interface (Req 9.1, design D12, §6): how Sighting codes travel between phones.
// Types only. A Transport carries text it cannot read: it never parses, validates, merges or
// stores a Sighting, and the rest of the app does not know which Transport delivered a code.

import type { VigiaReason } from '../../reasons';
import type { VigiaResult } from '../../result';

export type TransportStatus =
  | { readonly kind: 'available' }
  | { readonly kind: 'in_use' }
  | { readonly kind: 'unavailable'; readonly reason: VigiaReason };

export type Unsubscribe = () => void;

export interface Transport {
  /** Sends one Sighting code (any text: a Transport never reads it). */
  send(code: string): Promise<VigiaResult<void>>;
  /** Delivers the texts that reach this phone. */
  onReceive(listener: (text: string) => void): Unsubscribe;
  /** Delivers the state now, and each time it changes. */
  onStatus(listener: (status: TransportStatus) => void): Unsubscribe;
  /** Leaves the channel: nothing more is sent or delivered. */
  stop(): void;
}

/** What one send does to one recipient: `copies` deliveries `delayMs` after the send. */
export interface DeliveryStep {
  readonly copies: number;
  readonly delayMs: number;
}

/**
 * A pure function from a send to the deliveries it makes: `[]` is loss, `copies: 2` is
 * duplication, different delays are reordering (Req 9.2). `sequence` counts the sends of the
 * network from 0.
 */
export type DeliveryPlan = (
  from: string,
  to: string,
  code: string,
  sequence: number,
) => readonly DeliveryStep[];
