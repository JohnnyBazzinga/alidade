import { describe, expect, it } from 'vitest';
import {
  FakeCameraSurface,
  FakeVideoSink,
  namedError,
  type FakeGetUserMedia,
} from '../../test-support/fake-camera-surface';
import type { UiFailure } from '../../result';
import { createCameraAdapter, type CameraStream } from './camera-adapter';

function setup(options: ConstructorParameters<typeof FakeCameraSurface>[0] = {}) {
  const surface = new FakeCameraSurface(options);
  return { surface, adapter: createCameraAdapter(surface) };
}

async function started(options: ConstructorParameters<typeof FakeCameraSurface>[0] = {}) {
  const s = setup(options);
  const r = await s.adapter.start();
  if (!r.ok) throw new Error(`start failed: ${r.reason}`);
  return { ...s, stream: r.value };
}

describe('Camera adapter: creation and the constraints (Req 7.1, 7.3)', () => {
  it('starts nothing until `start` is called', () => {
    const { surface } = setup();
    expect(surface.calls).toHaveLength(0);
    expect(surface.streams).toHaveLength(0);
  });

  it('asks for video only, an ideal environment camera and no exact facing mode', async () => {
    const { surface, adapter } = setup();
    await adapter.start();
    expect(surface.calls).toEqual([
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
    ]);
  });

  it('passes the ideal width and height when the caller has them, and leaves out a bad one', async () => {
    const a = setup();
    await a.adapter.start({ idealWidthSourcePx: 720, idealHeightSourcePx: 1280 });
    expect(a.surface.calls[0]?.video).toEqual({
      facingMode: { ideal: 'environment' },
      width: { ideal: 720 },
      height: { ideal: 1280 },
    });
    const b = setup();
    await b.adapter.start({ idealWidthSourcePx: Number.NaN, idealHeightSourcePx: -5 });
    expect(b.surface.calls[0]?.video).toEqual({ facingMode: { ideal: 'environment' } });
  });
});

describe('Camera adapter: before any camera API (Req 7.2)', () => {
  it('fails with insecure_context before calling getUserMedia', async () => {
    const { surface, adapter } = setup({ isSecureContext: false });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'insecure_context' });
    expect(surface.calls).toHaveLength(0);
  });

  it('fails with camera_unavailable when the surface has no getUserMedia', async () => {
    const { adapter } = setup({ hasGetUserMedia: false });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'camera_unavailable' });
  });

  it('checks the secure context before the missing function', async () => {
    const { adapter } = setup({ isSecureContext: false, hasGetUserMedia: false });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'insecure_context' });
  });
});

describe('Camera adapter: the mapping of errors (Req 7.4)', () => {
  const table: readonly [string, string][] = [
    ['NotAllowedError', 'camera_permission_denied'],
    ['SecurityError', 'camera_permission_denied'],
    ['NotFoundError', 'camera_unavailable'],
    ['OverconstrainedError', 'camera_unavailable'],
    ['NotReadableError', 'camera_busy'],
    ['AbortError', 'camera_busy'],
    ['TypeError', 'camera_failed'],
    ['SomethingNew', 'camera_failed'],
  ];
  for (const [name, reason] of table) {
    it(`${name} gives ${reason} and keeps the name`, async () => {
      const { adapter } = setup({ behaviour: { kind: 'reject', error: namedError(name) } });
      expect(await adapter.start()).toEqual({ ok: false, reason, errorName: name });
    });
  }

  for (const [label, error] of [
    ['a string', 'denied'],
    ['undefined', undefined],
    ['null', null],
    ['a number', 7],
  ] as const) {
    it(`a rejection that is ${label} gives camera_failed with no name`, async () => {
      const { adapter } = setup({ behaviour: { kind: 'reject', error } });
      expect(await adapter.start()).toEqual({ ok: false, reason: 'camera_failed' });
    });
  }

  it('an object whose name is not a string gives camera_failed with no name', async () => {
    const { adapter } = setup({ behaviour: { kind: 'reject', error: { name: 4 } } });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'camera_failed' });
  });

  it('an exception thrown by the surface is camera_failed even when it carries a mapped name', async () => {
    const { adapter } = setup({
      behaviour: { kind: 'throw', error: namedError('NotAllowedError') },
    });
    expect(await adapter.start()).toEqual({
      ok: false,
      reason: 'camera_failed',
      errorName: 'NotAllowedError',
    });
  });

  it('a surface that throws something that is not an object is camera_failed', async () => {
    const { adapter } = setup({ behaviour: { kind: 'throw', error: 'boom' } });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'camera_failed' });
  });

  it('allows a new start after a failure', async () => {
    const { surface, adapter } = setup({
      behaviour: { kind: 'reject', error: namedError('NotReadableError') },
    });
    expect((await adapter.start()).ok).toBe(false);
    surface.behaviour = { kind: 'resolve' };
    expect((await adapter.start()).ok).toBe(true);
    expect(surface.calls).toHaveLength(2);
  });
});

describe('Camera adapter: the facing mode (Req 7.5)', () => {
  it('a user-facing track is stopped and refused with wrong_camera', async () => {
    const { surface, adapter } = setup({
      behaviour: { kind: 'resolve', settings: { facingMode: 'user', width: 720, height: 1280 } },
    });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'wrong_camera' });
    expect(surface.runningTracks()).toHaveLength(0);
  });

  const cases: readonly [string, FakeGetUserMedia, 'rear' | 'unknown'][] = [
    [
      'environment',
      { kind: 'resolve', settings: { facingMode: 'environment', width: 1, height: 2 } },
      'rear',
    ],
    ['no facing mode', { kind: 'resolve', settings: { width: 1, height: 2 } }, 'unknown'],
    ['left', { kind: 'resolve', settings: { facingMode: 'left', width: 1, height: 2 } }, 'unknown'],
  ];
  for (const [label, behaviour, facing] of cases) {
    it(`${label} is accepted as ${facing}`, async () => {
      const { stream } = await started({ behaviour });
      expect(stream.facing).toBe(facing);
    });
  }

  it('a stream with no video track is camera_failed', async () => {
    const { adapter } = setup({ behaviour: { kind: 'noVideoTrack' } });
    expect(await adapter.start()).toEqual({ ok: false, reason: 'camera_failed' });
  });
});

describe('Camera adapter: the handle (Req 7.6)', () => {
  it('reports the size from the track settings', async () => {
    const { stream } = await started();
    expect(stream.sizeSourcePx()).toEqual({ widthSourcePx: 720, heightSourcePx: 1280 });
  });

  it('reports no size when the settings have none', async () => {
    const { stream } = await started({
      behaviour: { kind: 'resolve', settings: { facingMode: 'environment' } },
    });
    expect(stream.sizeSourcePx()).toBeNull();
  });

  it('attaches the stream to a sink and plays it', async () => {
    const { stream } = await started();
    const sink = new FakeVideoSink();
    stream.attach(sink);
    expect(sink.srcObject).not.toBeNull();
    expect(sink.playCount).toBe(1);
  });

  it('reports a different size when the video reports it, once per change', async () => {
    const { stream } = await started();
    const sink = new FakeVideoSink();
    stream.attach(sink);
    const sizes: unknown[] = [];
    stream.onSize((s) => sizes.push(s));
    sink.report(720, 1280, 'loadedmetadata');
    expect(sizes).toEqual([]);
    sink.report(1080, 1920);
    sink.report(1080, 1920);
    expect(sizes).toEqual([{ widthSourcePx: 1080, heightSourcePx: 1920 }]);
    expect(stream.sizeSourcePx()).toEqual({ widthSourcePx: 1080, heightSourcePx: 1920 });
  });

  it('ignores a video that reports no dimensions yet', async () => {
    const { stream } = await started();
    const sink = new FakeVideoSink();
    stream.attach(sink);
    const sizes: unknown[] = [];
    stream.onSize((s) => sizes.push(s));
    sink.report(0, 0, 'loadedmetadata');
    expect(sizes).toEqual([]);
  });

  it('detaching removes the listeners and the stream from the sink', async () => {
    const { stream } = await started();
    const sink = new FakeVideoSink();
    const detach = stream.attach(sink);
    expect(sink.listenerCount()).toBe(2);
    detach();
    detach();
    expect(sink.listenerCount()).toBe(0);
    expect(sink.srcObject).toBeNull();
  });

  it('a sink whose play throws or rejects delivers camera_failed to the ended listeners', async () => {
    for (const playBehaviour of ['throw', 'reject'] as const) {
      const { stream } = await started();
      const failures: UiFailure[] = [];
      stream.onEnded((f) => failures.push(f));
      stream.attach(new FakeVideoSink(playBehaviour));
      await Promise.resolve();
      await Promise.resolve();
      expect(failures.map((f) => f.reason)).toEqual(['camera_failed']);
    }
  });
});

describe('Camera adapter: a track that ends (Req 7.7)', () => {
  it('delivers camera_track_ended once, stops the other tracks and releases the sink', async () => {
    const { surface, stream } = await started({
      behaviour: {
        kind: 'resolve',
        settings: { facingMode: 'environment', width: 1, height: 2 },
        extraTracks: 2,
      },
    });
    const sink = new FakeVideoSink();
    stream.attach(sink);
    const failures: UiFailure[] = [];
    stream.onEnded((f) => failures.push(f));
    const track = surface.streams[0]?.tracks[0];
    track?.fireEnded();
    track?.fireEnded();
    expect(failures).toEqual([{ ok: false, reason: 'camera_track_ended' }]);
    expect(surface.runningTracks()).toHaveLength(0);
    expect(sink.listenerCount()).toBe(0);
  });

  it('keeps delivering to the others when one listener throws', async () => {
    const { surface, stream } = await started();
    const seen: string[] = [];
    stream.onEnded(() => {
      throw new Error('listener');
    });
    stream.onEnded((f) => seen.push(f.reason));
    surface.streams[0]?.tracks[0]?.fireEnded();
    expect(seen).toEqual(['camera_track_ended']);
  });

  it('allows a new start after the track ended', async () => {
    const { surface, adapter } = await started();
    surface.streams[0]?.tracks[0]?.fireEnded();
    const again = await adapter.start();
    expect(again.ok).toBe(true);
    expect(surface.calls).toHaveLength(2);
  });
});

describe('Camera adapter: stop (Req 7.8)', () => {
  it('stops every track, removes the track listener and the sink listeners', async () => {
    const { surface, adapter, stream } = await started({
      behaviour: {
        kind: 'resolve',
        settings: { facingMode: 'environment', width: 1, height: 2 },
        extraTracks: 1,
      },
    });
    const sink = new FakeVideoSink();
    stream.attach(sink);
    adapter.stop();
    expect(surface.runningTracks()).toHaveLength(0);
    expect(surface.streams[0]?.tracks[0]?.listenerCount()).toBe(0);
    expect(sink.listenerCount()).toBe(0);
    expect(sink.srcObject).toBeNull();
  });

  it('a second stop does nothing', async () => {
    const { surface, adapter } = await started();
    adapter.stop();
    const count = surface.streams[0]?.tracks[0]?.stopCount;
    adapter.stop();
    expect(surface.streams[0]?.tracks[0]?.stopCount).toBe(count);
  });

  it('a stop with nothing started does nothing and a stop does not deliver camera_track_ended', async () => {
    const idle = setup();
    expect(() => idle.adapter.stop()).not.toThrow();
    const { adapter, stream } = await started();
    const failures: UiFailure[] = [];
    stream.onEnded((f) => failures.push(f));
    adapter.stop();
    expect(failures).toEqual([]);
  });

  it('stop while pending settles the pending start with camera_stopped at once', async () => {
    const { surface, adapter } = setup({ behaviour: { kind: 'hang' } });
    const pending = adapter.start();
    adapter.stop();
    expect(await pending).toEqual({ ok: false, reason: 'camera_stopped' });
    expect(surface.streams).toHaveLength(0);
  });

  it('a stream that arrives after a stop is stopped at once', async () => {
    const { surface, adapter } = setup({ behaviour: { kind: 'hang' } });
    const pending = adapter.start();
    adapter.stop();
    await pending;
    surface.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(surface.streams).toHaveLength(1);
    expect(surface.runningTracks()).toHaveLength(0);
  });

  it('a rejection that arrives after a stop changes nothing', async () => {
    const { surface, adapter } = setup({ behaviour: { kind: 'hang' } });
    const pending = adapter.start();
    adapter.stop();
    surface.releaseWith(namedError('NotAllowedError'));
    expect(await pending).toEqual({ ok: false, reason: 'camera_stopped' });
  });

  it('a start after a stop-while-pending is a new start that the old stream does not disturb', async () => {
    const { surface, adapter } = setup({ behaviour: { kind: 'hang' } });
    const first = adapter.start();
    adapter.stop();
    await first;
    const second = adapter.start();
    surface.release();
    const result = await second;
    expect(result.ok).toBe(true);
    // The first (cancelled) stream is stopped; the second runs.
    expect(surface.streams).toHaveLength(2);
    expect(surface.runningTracks()).toHaveLength(1);
  });
});

describe('Camera adapter: a second start (Req 7.9)', () => {
  it('while pending, calls getUserMedia once and gives the same result', async () => {
    const { surface, adapter } = setup({ behaviour: { kind: 'hang' } });
    const a = adapter.start();
    const b = adapter.start();
    surface.release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(surface.calls).toHaveLength(1);
    expect(ra.ok && rb.ok && ra.value === rb.value).toBe(true);
  });

  it('while running, calls getUserMedia once and returns the same stream', async () => {
    const { surface, adapter, stream } = await started();
    const again = await adapter.start();
    expect(surface.calls).toHaveLength(1);
    expect(again.ok && again.value === stream).toBe(true);
  });
});

describe('Camera adapter: no track left running (Req 7.10)', () => {
  it('after every failure path that obtained a stream', async () => {
    const paths: readonly (() => Promise<FakeCameraSurface>)[] = [
      async () => {
        const s = new FakeCameraSurface({
          behaviour: { kind: 'resolve', settings: { facingMode: 'user' }, extraTracks: 2 },
        });
        await createCameraAdapter(s).start();
        return s;
      },
      async () => {
        const s = new FakeCameraSurface({ behaviour: { kind: 'noVideoTrack' } });
        await createCameraAdapter(s).start();
        return s;
      },
      async () => {
        const s = new FakeCameraSurface({
          behaviour: { kind: 'hang' },
        });
        const adapter = createCameraAdapter(s);
        const p = adapter.start();
        adapter.stop();
        await p;
        s.release();
        await Promise.resolve();
        await Promise.resolve();
        return s;
      },
    ];
    for (const path of paths) expect((await path()).runningTracks()).toHaveLength(0);
  });

  it('a track whose settings throw is camera_failed and is stopped', async () => {
    const surface = new FakeCameraSurface();
    const original = surface.getUserMedia;
    if (original === null) throw new Error('fake');
    const throwing = {
      isSecureContext: true,
      getUserMedia: async (c: Parameters<typeof original>[0]) => {
        const stream = await original(c);
        const track = stream.getTracks()[0];
        if (track)
          track.getSettings = () => {
            throw new Error('settings');
          };
        return stream;
      },
    };
    const result = await createCameraAdapter(throwing).start();
    expect(result).toEqual({ ok: false, reason: 'camera_failed' });
    expect(surface.runningTracks()).toHaveLength(0);
  });

  it('a track that throws on stop does not stop the others from being stopped', async () => {
    const { surface, adapter } = await started({
      behaviour: {
        kind: 'resolve',
        settings: { facingMode: 'environment', width: 1, height: 2 },
        extraTracks: 1,
      },
    });
    const first = surface.streams[0]?.tracks[0];
    if (first)
      first.stop = () => {
        throw new Error('stop');
      };
    expect(() => adapter.stop()).not.toThrow();
    expect(surface.streams[0]?.tracks[1]?.stopped).toBe(true);
  });
});

describe('Camera adapter: it hands out nothing but the stream handle (Req 7.10)', () => {
  it('the handle exposes only plain operations, no browser object', async () => {
    const { stream } = await started();
    const keys = Object.keys(stream satisfies CameraStream).sort();
    expect(keys).toEqual(['attach', 'facing', 'onEnded', 'onSize', 'sizeSourcePx']);
  });
});
