// A camera surface that always gives a stream (test support, not exported): enough for
// `DeviceSighting` to start in a component test.

import type { CameraSurface } from '@alidade/ui';

export function fakeCameraSurface(): CameraSurface {
  const track = {
    kind: 'video',
    getSettings: () => ({ width: 1280, height: 720, facingMode: 'environment' }),
    stop: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { isSecureContext: true, getUserMedia: () => Promise.resolve(stream) };
}
