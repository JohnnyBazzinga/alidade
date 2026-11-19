// A fake of the camera's browser surface and a fixed element size (test support, not exported;
// the smallest copy of UI's fakes that the sighting screen needs, UI D20): every request for the
// rear camera gives one running track, recorded so that a test can check what was asked and that
// the track is stopped.

import type {
  CameraConstraints,
  CameraSurface,
  MediaStreamLike,
  ObserveElementSize,
  TrackLike,
} from '@alidade/ui';

export class FakeTrack implements TrackLike {
  readonly kind = 'video';
  stopped = false;
  getSettings() {
    return { facingMode: 'environment', width: 720, height: 1280 };
  }
  stop(): void {
    this.stopped = true;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

export class FakeCameraSurface implements CameraSurface {
  readonly isSecureContext = true;
  readonly calls: CameraConstraints[] = [];
  readonly tracks: FakeTrack[] = [];
  readonly getUserMedia = (constraints: CameraConstraints): Promise<MediaStreamLike> => {
    this.calls.push(constraints);
    const track = new FakeTrack();
    this.tracks.push(track);
    return Promise.resolve({ getTracks: () => [track], getVideoTracks: () => [track] });
  };
}

/** An element of a fixed size: jsdom does no layout. */
export function fixedSize(widthPx: number, heightPx: number): ObserveElementSize {
  return (_element, listener) => {
    listener({ widthPx, heightPx });
    return () => undefined;
  };
}
