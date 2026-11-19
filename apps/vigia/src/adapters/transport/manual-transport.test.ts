// The manual Transport (Req 9.1, 10.1, design §7.19): the link, the QR and the text are one Transport
// whose send hands the code to the Share sheet and whose receive side is the paste box and the
// page's fragment.

import { describe, expect, it } from 'vitest';
import type { TransportStatus } from '../../math/transport/transport';
import { createManualTransport } from './manual-transport';

describe('send', () => {
  it('hands the code to `present` unchanged and succeeds', async () => {
    const presented: string[] = [];
    const transport = createManualTransport({ present: (code) => presented.push(code) });
    expect(await transport.send('A2B3')).toEqual({ ok: true, value: undefined });
    expect(presented).toEqual(['A2B3']);
  });

  it('a `present` that throws is transport_unavailable with the error name, not an exception', async () => {
    const error = new Error('no sheet');
    error.name = 'SheetError';
    const transport = createManualTransport({
      present: () => {
        throw error;
      },
    });
    expect(await transport.send('x')).toEqual({
      ok: false,
      reason: 'transport_unavailable',
      errorName: 'SheetError',
    });
  });

  it('after stop() a send is transport_unavailable and presents nothing', async () => {
    const presented: string[] = [];
    const transport = createManualTransport({ present: (code) => presented.push(code) });
    transport.stop();
    expect(await transport.send('x')).toEqual({ ok: false, reason: 'transport_unavailable' });
    expect(presented).toEqual([]);
  });
});

describe('receive', () => {
  it('delivers any text, unread, to every listener', () => {
    const transport = createManualTransport({ present: () => undefined });
    const a: string[] = [];
    const b: string[] = [];
    transport.onReceive((t) => a.push(t));
    transport.onReceive((t) => b.push(t));
    const texts = ['', 'hello', 'https://x.test/#ABC', '\u0000', 'Z'.repeat(5000)];
    for (const text of texts) transport.receive(text);
    expect(a).toEqual(texts);
    expect(b).toEqual(texts);
  });

  it('an unsubscribed listener hears nothing, and one that throws does not stop the others', () => {
    const transport = createManualTransport({ present: () => undefined });
    const got: string[] = [];
    const off = transport.onReceive((t) => got.push(t));
    transport.onReceive(() => {
      throw new Error('bad listener');
    });
    const last: string[] = [];
    transport.onReceive((t) => last.push(t));
    transport.receive('one');
    off();
    transport.receive('two');
    expect(got).toEqual(['one']);
    expect(last).toEqual(['one', 'two']);
  });

  it('after stop() nothing is delivered', () => {
    const transport = createManualTransport({ present: () => undefined });
    const got: string[] = [];
    transport.onReceive((t) => got.push(t));
    transport.stop();
    transport.receive('late');
    expect(got).toEqual([]);
  });
});

describe('status', () => {
  it('is available, and unavailable after stop()', () => {
    const transport = createManualTransport({ present: () => undefined });
    const seen: TransportStatus[] = [];
    transport.onStatus((s) => seen.push(s));
    transport.stop();
    expect(seen).toEqual([
      { kind: 'available' },
      { kind: 'unavailable', reason: 'transport_unavailable' },
    ]);
  });
});
