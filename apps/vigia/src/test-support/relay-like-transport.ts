// A second Transport, built differently from the memory network (Req 9.9, design §7.19; test
// support, not exported). Where the memory network sets one one-shot Timer for each delivery, this
// one routes every send through one shared list held by a "relay" and delivers it with one Timer
// that ticks once a millisecond, in order of (due tick, arrival at the relay). It is the shape a
// server relay would have. It uses the same plan, so the same cases run through both.

import type { Timer, TimerHandle } from '@alidade/ui';
import { err, ok, type VigiaResult } from '../result';
import type {
  DeliveryPlan,
  Transport,
  TransportStatus,
  Unsubscribe,
} from '../math/transport/transport';

interface Phone {
  readonly id: string;
  readonly receivers: Set<(text: string) => void>;
  readonly watchers: Set<(status: TransportStatus) => void>;
  stopped: boolean;
}

interface Pending {
  readonly dueTick: number;
  readonly order: number;
  readonly to: Phone;
  readonly text: string;
}

export interface RelayLike {
  join(phoneId: string): Transport;
}

export function createRelayLikeTransport(plan: DeliveryPlan, timer: Timer): RelayLike {
  const phones: Phone[] = [];
  let pending: Pending[] = [];
  let tick = 0;
  let order = 0;
  let sequence = 0;
  let handle: TimerHandle | null = null;

  const deliver = (item: Pending): void => {
    if (item.to.stopped) return;
    for (const receiver of [...item.to.receivers]) {
      try {
        receiver(item.text);
      } catch {
        // A listener's failure is its own.
      }
    }
  };

  const onTick = (): void => {
    tick += 1;
    const due = pending
      .filter((p) => p.dueTick <= tick)
      .sort((a, b) => a.dueTick - b.dueTick || a.order - b.order);
    pending = pending.filter((p) => p.dueTick > tick);
    for (const item of due) deliver(item);
    if (pending.length === 0 && handle !== null) {
      timer.stop(handle);
      handle = null;
    }
  };

  const route = (from: Phone, code: string): void => {
    const thisSend = sequence;
    sequence += 1;
    for (const to of phones) {
      if (to === from || to.stopped) continue;
      for (const step of plan(from.id, to.id, code, thisSend)) {
        for (let copy = 0; copy < step.copies; copy += 1) {
          pending.push({ dueTick: tick + step.delayMs, order, to, text: code });
          order += 1;
        }
      }
    }
    if (pending.length > 0 && handle === null) handle = timer.start(onTick, 1);
  };

  return {
    join: (phoneId): Transport => {
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
        send: (code): Promise<VigiaResult<void>> => {
          if (phone.stopped) return Promise.resolve(err('transport_unavailable'));
          route(phone, code);
          return Promise.resolve(ok(undefined));
        },
        onReceive: (listener) => subscribe(phone.receivers, listener),
        onStatus: (listener) => {
          listener(
            phone.stopped
              ? { kind: 'unavailable', reason: 'transport_unavailable' }
              : { kind: 'available' },
          );
          return subscribe(phone.watchers, listener);
        },
        stop: () => {
          phone.stopped = true;
        },
      };
    },
  };
}
