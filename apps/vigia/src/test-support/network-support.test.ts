// The fakes of the Network gate are not vacuous (tasks 1.4): the fake fetch records and honours
// abort, and the recording gate records and refuses.

import { describe, expect, it } from 'vitest';
import { bytesOf, createFakeFetch } from './fake-fetch';
import { createRecordingGate, fixedAnswer } from './recording-gate';

const INIT = () => ({
  method: 'GET' as const,
  credentials: 'omit' as const,
  referrerPolicy: 'no-referrer' as const,
  redirect: 'error' as const,
  cache: 'no-store' as const,
  headers: {},
  signal: new AbortController().signal,
});

describe('the fake fetch', () => {
  it('records each call with its URL and options', async () => {
    const fake = createFakeFetch();
    await fake.fetchLike('https://a.test/', INIT());
    await fake.fetchLike('https://b.test/', INIT());
    expect(fake.calls.map((c) => c.url)).toEqual(['https://a.test/', 'https://b.test/']);
  });

  it('rejects a hanging call with an AbortError when its signal is aborted', async () => {
    const fake = createFakeFetch(() => ({ kind: 'hang' }));
    const controller = new AbortController();
    const pending = fake.fetchLike('https://a.test/', { ...INIT(), signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('streams its chunks one at a time, then ends', async () => {
    const fake = createFakeFetch(() => ({
      kind: 'stream',
      status: 200,
      chunks: [bytesOf('ab'), bytesOf('c')],
    }));
    const response = await fake.fetchLike('https://a.test/', INIT());
    const reader = response.body?.getReader();
    expect(await reader?.read()).toEqual({ done: false, value: bytesOf('ab') });
    expect(await reader?.read()).toEqual({ done: false, value: bytesOf('c') });
    expect(await reader?.read()).toEqual({ done: true, value: undefined });
    expect(fake.chunksRead).toBe(2);
  });
});

describe('the recording gate', () => {
  it('records every URL and refuses it by default', async () => {
    const gate = createRecordingGate();
    expect(await gate.get('https://a.test/')).toMatchObject({
      ok: false,
      reason: 'host_not_allowed',
    });
    expect(gate.calls).toEqual(['https://a.test/']);
  });

  it('answers when it is given an answer, and still records', async () => {
    const gate = createRecordingGate(fixedAnswer('{}'));
    expect(await gate.get('https://a.test/')).toEqual({ ok: true, value: '{}' });
    expect(gate.calls).toHaveLength(1);
  });
});
