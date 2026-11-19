// The in-memory network (Req 9.2, design D12, §7.19): a Transport for the tests and for Simulation
// mode that delivers a sent code to every other phone on the network, as a delivery plan says. The
// plan is a pure function from a send to a list of `{ copies, delayMs }`, so loss (`[]`),
// duplication (`copies: 2`), delay and reordering (different delays) are all deterministic. A
// delivery with no delay is made at once; a delayed one is a one-shot of the injected Timer. A
// Transport never reads the text it carries.

import type { Timer } from '@alidade/ui';
import type {
  DeliveryPlan,
  DeliveryStep,
  Transport,
  TransportStatus,
  Unsubscribe,
} from '../../math/transport/transport';
import { err, ok, type VigiaResult } from '../../result';

/** The plan of the plain network: every other phone gets one copy at once. */
export const DIRECT_DELIVERY: DeliveryPlan = () => [{ copies: 1, delayMs: 0 }];

/**
 * The most copies one step may make. A step with more, or with a count that is not a whole
 * number, or with a delay that is not a finite number of at least 0, is not a delivery plan this
 * network can run, and delivers nothing (a hostile plan must not hang the page).
 */
export const MAX_COPIES_PER_STEP = 16;

export interface MemoryNetwork {
  /** A phone on the network. `phoneId` is a label the plan sees; it need not be unique. */
  join(phoneId: string): Transport;
}

interface Phone {
  readonly id: string;
  readonly receivers: Set<(text: string) => void>;
  readonly watchers: Set<(status: TransportStatus) => void>;
  stopped: boolean;
}

const UNAVAILABLE: TransportStatus = { kind: 'unavailable', reason: 'transport_unavailable' };

function statusOf(phone: Phone): TransportStatus {
  return phone.stopped ? UNAVAILABLE : { kind: 'available' };
}

function tell<T>(listeners: ReadonlySet<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch {
      // A listener's failure is its own: the others still hear.
    }
  }
}

function validStep(step: DeliveryStep): boolean {
  return (
    Number.isInteger(step.copies) &&
    step.copies >= 0 &&
    step.copies <= MAX_COPIES_PER_STEP &&
    Number.isFinite(step.delayMs) &&
    step.delayMs >= 0
  );
}

export function createMemoryNetwork(plan: DeliveryPlan, timer: Timer): MemoryNetwork {
  const phones: Phone[] = [];
  let sequence = 0;

  const deliverLater = (to: Phone, text: string, delayMs: number): void => {
    if (delayMs <= 0) {
      if (!to.stopped) tell(to.receivers, text);
      return;
    }
    const handle = timer.start(() => {
      timer.stop(handle);
      if (!to.stopped) tell(to.receivers, text);
    }, delayMs);
  };

  return {
    join(phoneId) {
      const phone: Phone = {
        id: phoneId,
        receivers: new Set(),
        watchers: new Set(),
        stopped: false,
      };
      phones.push(phone);
      const subscribe = <T>(set: Set<T>, listener: T): Unsubscribe => {
        set.add(listener);
        return () => {
          set.delete(listener);
        };
      };
      return {
        send(code): Promise<VigiaResult<void>> {
          if (phone.stopped) return Promise.resolve(err('transport_unavailable'));
          const thisSend = sequence;
          sequence += 1;
          for (const to of [...phones]) {
            if (to === phone || to.stopped) continue;
            for (const step of plan(phone.id, to.id, code, thisSend)) {
              if (!validStep(step)) continue;
              for (let copy = 0; copy < step.copies; copy += 1)
                deliverLater(to, code, step.delayMs);
            }
          }
          return Promise.resolve(ok(undefined));
        },
        onReceive: (listener) => subscribe(phone.receivers, listener),
        onStatus(listener) {
          const off = subscribe(phone.watchers, listener);
          listener(statusOf(phone));
          return off;
        },
        stop() {
          if (phone.stopped) return;
          phone.stopped = true;
          tell(phone.watchers, statusOf(phone));
        },
      };
    },
  };
}
