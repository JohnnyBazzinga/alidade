import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCameraAdapter } from '../adapters/camera/camera-adapter';
import { FakeCameraSurface, FakeVideoSink } from '../test-support/fake-camera-surface';
import { CameraImage } from './CameraImage';

async function stream() {
  const r = await createCameraAdapter(new FakeCameraSurface()).start();
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe('CameraImage (Req 10.4, design D11)', () => {
  it('attaches the stream on mount and detaches it on unmount', async () => {
    const s = await stream();
    const sink = new FakeVideoSink();
    const { unmount } = render(
      <CameraImage stream={s} frozen={false} fit="cover" sinkFor={() => sink} />,
    );
    expect(sink.srcObject).not.toBeNull();
    expect(sink.playCount).toBe(1);
    unmount();
    expect(sink.srcObject).toBeNull();
    expect(sink.listenerCount()).toBe(0);
  });

  it('pauses on freeze, plays again on leaving it, and does neither on mount', async () => {
    const s = await stream();
    const sink = new FakeVideoSink();
    const sinkFor = () => sink;
    const { rerender } = render(
      <CameraImage stream={s} frozen={false} fit="cover" sinkFor={sinkFor} />,
    );
    expect(sink.pauseCount).toBe(0);
    rerender(<CameraImage stream={s} frozen fit="cover" sinkFor={sinkFor} />);
    expect(sink.pauseCount).toBe(1);
    rerender(<CameraImage stream={s} frozen fit="cover" sinkFor={sinkFor} />);
    expect(sink.pauseCount).toBe(1);
    rerender(<CameraImage stream={s} frozen={false} fit="cover" sinkFor={sinkFor} />);
    expect(sink.playCount).toBe(2);
  });

  it('uses the Image fit as the object fit and attaches nothing without a stream', () => {
    const sink = new FakeVideoSink();
    const { getByTestId } = render(
      <CameraImage stream={null} frozen={false} fit="contain" sinkFor={() => sink} />,
    );
    expect(getByTestId('camera-video').style.objectFit).toBe('contain');
    expect(sink.playCount).toBe(0);
  });
});
