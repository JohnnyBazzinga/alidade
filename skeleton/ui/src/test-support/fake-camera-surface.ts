// Fakes of the camera's browser surface and of a video element (Req 7.11, 21.3; test support, not
// exported). They record what the adapter does, so that a test can check that no track is left
// running on any path.

import type {
  CameraConstraints,
  CameraSurface,
  MediaStreamLike,
  TrackLike,
  TrackSettingsLike,
  VideoSink,
} from '../adapters/camera/camera-surface';

export class FakeTrack implements TrackLike {
  readonly kind = 'video';
  stopped = false;
  stopCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly settings: TrackSettingsLike,
    private readonly behaviour: {
      readonly throwOnStop?: boolean;
      readonly throwOnSettings?: boolean;
    } = {},
  ) {}

  getSettings(): TrackSettingsLike {
    if (this.behaviour.throwOnSettings) throw new Error('settings');
    return this.settings;
  }

  stop(): void {
    this.stopCount += 1;
    this.stopped = true;
    if (this.behaviour.throwOnStop) throw new Error('stop');
  }

  addEventListener(_type: 'ended', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'ended', listener: () => void): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  /** The browser ends the track (the camera was taken, the screen locked). */
  fireEnded(): void {
    for (const l of [...this.listeners]) l();
  }
}

export class FakeStream implements MediaStreamLike {
  constructor(readonly tracks: readonly FakeTrack[]) {}
  getTracks(): TrackLike[] {
    return [...this.tracks];
  }
  getVideoTracks(): TrackLike[] {
    return [...this.tracks];
  }
}

export type FakeGetUserMedia =
  | {
      readonly kind: 'resolve';
      readonly settings?: TrackSettingsLike;
      readonly extraTracks?: number;
    }
  | { readonly kind: 'noVideoTrack' }
  | { readonly kind: 'reject'; readonly error: unknown }
  | { readonly kind: 'throw'; readonly error: unknown }
  /** Settles only when the test calls `release`. */
  | { readonly kind: 'hang'; readonly settings?: TrackSettingsLike };

export interface FakeCameraOptions {
  readonly isSecureContext?: boolean;
  readonly hasGetUserMedia?: boolean;
  readonly behaviour?: FakeGetUserMedia;
}

/** A named error object, as the browser's `DOMException` is for the adapter. */
export function namedError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

export class FakeCameraSurface implements CameraSurface {
  readonly isSecureContext: boolean;
  readonly getUserMedia: CameraSurface['getUserMedia'];
  readonly calls: CameraConstraints[] = [];
  readonly streams: FakeStream[] = [];
  behaviour: FakeGetUserMedia;
  private readonly hanging: ((stream: FakeStream) => void)[] = [];
  private readonly hangingFail: ((error: unknown) => void)[] = [];

  constructor(options: FakeCameraOptions = {}) {
    this.isSecureContext = options.isSecureContext ?? true;
    this.behaviour = options.behaviour ?? {
      kind: 'resolve',
      settings: { facingMode: 'environment', width: 720, height: 1280 },
    };
    this.getUserMedia =
      options.hasGetUserMedia === false
        ? null
        : (constraints) => {
            this.calls.push(constraints);
            const b = this.behaviour;
            if (b.kind === 'throw') throw b.error;
            if (b.kind === 'reject') return Promise.reject(b.error);
            if (b.kind === 'hang') {
              return new Promise<MediaStreamLike>((resolve, reject) => {
                this.hanging.push((stream) => resolve(stream));
                this.hangingFail.push(reject);
              });
            }
            return Promise.resolve(this.make(b));
          };
  }

  private make(b: FakeGetUserMedia): FakeStream {
    const tracks: FakeTrack[] = [];
    if (b.kind === 'resolve' || b.kind === 'hang') {
      tracks.push(
        new FakeTrack(b.settings ?? { facingMode: 'environment', width: 720, height: 1280 }),
      );
    }
    if (b.kind === 'resolve')
      for (let i = 0; i < (b.extraTracks ?? 0); i += 1) tracks.push(new FakeTrack({}));
    const stream = new FakeStream(tracks);
    this.streams.push(stream);
    return stream;
  }

  /** Settles every hanging `getUserMedia` with a stream. */
  release(): void {
    const b = this.behaviour;
    for (const resolve of this.hanging.splice(0)) resolve(this.make(b));
    this.hangingFail.length = 0;
  }

  /** Rejects every hanging `getUserMedia`. */
  releaseWith(error: unknown): void {
    for (const reject of this.hangingFail.splice(0)) reject(error);
    this.hanging.length = 0;
  }

  /** Tracks of every stream ever given that have not been stopped (Req 7.10). */
  runningTracks(): FakeTrack[] {
    return this.streams.flatMap((s) => s.tracks).filter((t) => !t.stopped);
  }
}

/** A video element: records `play`, `pause`, the stream and its listeners. */
export class FakeVideoSink implements VideoSink {
  srcObject: unknown = null;
  videoWidth = 0;
  videoHeight = 0;
  playCount = 0;
  pauseCount = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(private readonly playBehaviour: 'resolve' | 'reject' | 'throw' = 'resolve') {}

  play(): Promise<void> | void {
    this.playCount += 1;
    if (this.playBehaviour === 'throw') throw new Error('play');
    if (this.playBehaviour === 'reject') return Promise.reject(namedError('NotAllowedError'));
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCount += 1;
  }

  addEventListener(type: 'loadedmetadata' | 'resize', listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: 'loadedmetadata' | 'resize', listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  /** The video reports dimensions and fires the event. */
  report(
    widthSourcePx: number,
    heightSourcePx: number,
    type: 'loadedmetadata' | 'resize' = 'resize',
  ): void {
    this.videoWidth = widthSourcePx;
    this.videoHeight = heightSourcePx;
    for (const l of [...(this.listeners.get(type) ?? [])]) l();
  }
}
