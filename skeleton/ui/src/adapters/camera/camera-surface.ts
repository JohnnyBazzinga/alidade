// The browser surface the Camera adapter works on (Req 7.1, design D10): plain structural types,
// so that an `HTMLVideoElement`, a `MediaStream` and a `MediaStreamTrack` satisfy them and a test
// fake implements them. Types only: this file names no browser global.

/** The part of a track's settings the adapter reads. */
export interface TrackSettingsLike {
  readonly width?: number;
  readonly height?: number;
  readonly facingMode?: string;
}

export interface TrackLike {
  readonly kind: string;
  getSettings(): TrackSettingsLike;
  stop(): void;
  addEventListener(type: 'ended', listener: () => void): void;
  removeEventListener(type: 'ended', listener: () => void): void;
}

export interface MediaStreamLike {
  getTracks(): TrackLike[];
  getVideoTracks(): TrackLike[];
}

/** The constraints the adapter asks for (Req 7.3): video only, `ideal` and never `exact`. */
export interface CameraConstraints {
  readonly audio: false;
  readonly video: {
    readonly facingMode: { readonly ideal: 'environment' };
    readonly width?: { readonly ideal: number };
    readonly height?: { readonly ideal: number };
  };
}

export interface CameraSurface {
  readonly isSecureContext: boolean;
  /** `null` when the browser has no `getUserMedia`. */
  readonly getUserMedia: ((constraints: CameraConstraints) => Promise<MediaStreamLike>) | null;
}

/** What the adapter attaches the stream to: an `HTMLVideoElement` satisfies it (design D10). */
export interface VideoSink {
  srcObject: unknown;
  readonly videoWidth: number;
  readonly videoHeight: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'loadedmetadata' | 'resize', listener: () => void): void;
  removeEventListener(type: 'loadedmetadata' | 'resize', listener: () => void): void;
}
