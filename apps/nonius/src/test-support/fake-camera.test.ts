import { describe, expect, it } from 'vitest';
import { fakeCameraSurface } from './fake-camera';

describe('fakeCameraSurface', () => {
  it('is secure and gives one video track with a size', async () => {
    const surface = fakeCameraSurface();
    expect(surface.isSecureContext).toBe(true);
    const stream = await surface.getUserMedia?.({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    expect(stream?.getVideoTracks()).toHaveLength(1);
    expect(stream?.getVideoTracks()[0]?.getSettings().width).toBe(1280);
  });
});
