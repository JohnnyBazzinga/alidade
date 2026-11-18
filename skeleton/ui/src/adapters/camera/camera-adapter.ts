// The Camera adapter (Req 7, design §7.12, D10): the rear camera started and stopped by the
// caller, and every way it fails delivered as a value. It reads no global: the surface is injected.
// It starts only when `start` is called (so that iOS is asked from a user gesture), never throws,
// and leaves no track running on any failure path.

import type { Unsubscribe } from '@alidade/sensors';
import { err, ok, type UiFailure, type UiResult } from '../../result';
import type { UiReason } from '../../reasons';
import type { SourceSize } from '../../math/image-layout';
import type {
  CameraConstraints,
  CameraSurface,
  MediaStreamLike,
  TrackLike,
  VideoSink,
} from './camera-surface';

export interface CameraStartRequest {
  /** The ideal width of the stream: the size of the calibration's image, when there is one. */
  readonly idealWidthSourcePx?: number;
  readonly idealHeightSourcePx?: number;
}

export interface CameraStream {
  /**
   * The Source image size: from the track's settings until a video sink reports one. `null` when
   * the browser reports none, so that nothing is laid out against a size nobody knows.
   */
  sizeSourcePx(): SourceSize | null;
  /** `rear` when the track reports `environment`, `unknown` when it reports nothing (Req 7.5). */
  readonly facing: 'rear' | 'unknown';
  /** Plays the stream in `sink`; the returned function detaches it. */
  attach(sink: VideoSink): () => void;
  /** Called when the video reports other dimensions after it starts playing (Req 7.6). */
  onSize(listener: (size: SourceSize) => void): Unsubscribe;
  /** Called once with `camera_track_ended` when the track ends (Req 7.7). */
  onEnded(listener: (failure: UiFailure) => void): Unsubscribe;
}

export interface CameraAdapter {
  start(request?: CameraStartRequest): Promise<UiResult<CameraStream>>;
  stop(): void;
}

type State = 'idle' | 'pending' | 'running' | 'stopped';

/** The failure for the `name` of a rejection of `getUserMedia` (Req 7.4). */
function failureForRejection(error: unknown): UiFailure {
  const name = nameOf(error);
  const details = name === null ? {} : { errorName: name };
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return err('camera_permission_denied', details);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return err('camera_unavailable', details);
    case 'NotReadableError':
    case 'AbortError':
      return err('camera_busy', details);
    default:
      return err('camera_failed', details);
  }
}

/** The `name` of an error object, or `null` for anything else. */
function nameOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  try {
    const name: unknown = (error as { readonly name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

function positiveFinite(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

/** Stops every track, ignoring a track that throws; used on every failure path (Req 7.10). */
function stopAll(stream: MediaStreamLike | null): void {
  if (stream === null) return;
  let tracks: TrackLike[];
  try {
    tracks = stream.getTracks();
  } catch {
    return;
  }
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // A track that cannot be stopped is not retried.
    }
  }
}

/** A Camera adapter over `surface`. Creating it starts nothing (Req 7.1). */
export function createCameraAdapter(surface: CameraSurface): CameraAdapter {
  let state: State = 'idle';
  let result: Promise<UiResult<CameraStream>> | null = null;
  /** Settles the pending start; set while a start is pending. */
  let settlePending: ((r: UiResult<CameraStream>) => void) | null = null;
  /** Everything that must be undone by `stop`. */
  let teardown: (() => void) | null = null;

  function start(request: CameraStartRequest = {}): Promise<UiResult<CameraStream>> {
    if ((state === 'pending' || state === 'running') && result !== null) return result;
    const attempt = new Promise<UiResult<CameraStream>>((resolve) => {
      let settled = false;
      const settle = (r: UiResult<CameraStream>): void => {
        if (settled) return;
        settled = true;
        settlePending = null;
        if (!r.ok && state === 'pending') {
          state = 'idle';
          result = null;
        }
        resolve(r);
      };
      settlePending = settle;
      state = 'pending';
      void run(request, () => settled, settle);
    });
    // `result` is assigned after the executor ran, which may already have settled a failure.
    if (state === 'pending' || state === 'running') result = attempt;
    return attempt;
  }

  /** Runs one start. `cancelled()` is true once `stop` settled this attempt. */
  async function run(
    request: CameraStartRequest,
    cancelled: () => boolean,
    settle: (r: UiResult<CameraStream>) => void,
  ): Promise<void> {
    if (!surface.isSecureContext) return settle(err('insecure_context'));
    const getUserMedia = surface.getUserMedia;
    if (getUserMedia === null) return settle(err('camera_unavailable'));
    const constraints: CameraConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        ...(positiveFinite(request.idealWidthSourcePx)
          ? { width: { ideal: request.idealWidthSourcePx } }
          : {}),
        ...(positiveFinite(request.idealHeightSourcePx)
          ? { height: { ideal: request.idealHeightSourcePx } }
          : {}),
      },
    };
    // An exception thrown by the surface is `camera_failed` whatever its name; a rejection of the
    // promise it returns is mapped by the error's name (Req 7.4).
    let asked: Promise<MediaStreamLike>;
    try {
      asked = getUserMedia(constraints);
    } catch (error) {
      const name = nameOf(error);
      return settle(err('camera_failed', name === null ? {} : { errorName: name }));
    }
    let stream: MediaStreamLike;
    try {
      stream = await asked;
    } catch (error) {
      return settle(failureForRejection(error));
    }
    if (cancelled()) {
      // `stop` settled this start with `camera_stopped`; the stream that arrived is stopped now.
      stopAll(stream);
      return;
    }
    try {
      settle(adopt(stream));
    } catch {
      stopAll(stream);
      settle(err('camera_failed'));
    }
  }

  /** Reads the stream's video track and builds the handle, or stops the stream and fails. */
  function adopt(stream: MediaStreamLike): UiResult<CameraStream> {
    let track: TrackLike | undefined;
    let settings: ReturnType<TrackLike['getSettings']>;
    try {
      track = stream.getVideoTracks()[0];
      if (track === undefined) throw new Error('no video track');
      settings = track.getSettings();
    } catch {
      stopAll(stream);
      return err('camera_failed');
    }
    if (settings.facingMode === 'user') {
      stopAll(stream);
      return err('wrong_camera');
    }
    const facing: 'rear' | 'unknown' = settings.facingMode === 'environment' ? 'rear' : 'unknown';
    let size: SourceSize | null =
      positiveFinite(settings.width) && positiveFinite(settings.height)
        ? { widthSourcePx: settings.width, heightSourcePx: settings.height }
        : null;

    const sizeListeners = new Set<(size: SourceSize) => void>();
    const endedListeners = new Set<(failure: UiFailure) => void>();
    const detachers = new Set<() => void>();
    let failed = false;

    const deliverFailure = (reason: UiReason): void => {
      if (failed) return;
      failed = true;
      const failure = err(reason);
      for (const listener of [...endedListeners]) {
        try {
          listener(failure);
        } catch {
          // A listener that throws must not stop the others.
        }
      }
    };
    const onEnded = (): void => {
      if (failed) return;
      deliverFailure('camera_track_ended');
      // The track has ended: stop the others and release everything (Req 7.7).
      finish();
    };
    const finish = (): void => {
      try {
        track?.removeEventListener('ended', onEnded);
      } catch {
        // Nothing to remove.
      }
      stopAll(stream);
      for (const detach of [...detachers]) detach();
      detachers.clear();
      sizeListeners.clear();
      endedListeners.clear();
      teardown = null;
      if (state === 'running') state = 'stopped';
    };
    try {
      track.addEventListener('ended', onEnded);
    } catch {
      stopAll(stream);
      return err('camera_failed');
    }
    state = 'running';
    teardown = finish;

    const handle: CameraStream = {
      sizeSourcePx: () => size,
      facing,
      attach(sink) {
        const reportSize = (): void => {
          const width = sink.videoWidth;
          const height = sink.videoHeight;
          if (!positiveFinite(width) || !positiveFinite(height)) return;
          if (size !== null && size.widthSourcePx === width && size.heightSourcePx === height)
            return;
          size = { widthSourcePx: width, heightSourcePx: height };
          for (const listener of [...sizeListeners]) {
            try {
              listener(size);
            } catch {
              // A listener that throws must not stop the others.
            }
          }
        };
        try {
          sink.srcObject = stream;
          sink.addEventListener('loadedmetadata', reportSize);
          sink.addEventListener('resize', reportSize);
          const played = sink.play();
          if (played !== undefined && typeof played.then === 'function') {
            played.then(undefined, () => deliverFailure('camera_failed'));
          }
        } catch {
          deliverFailure('camera_failed');
        }
        let detached = false;
        const detach = (): void => {
          if (detached) return;
          detached = true;
          detachers.delete(detach);
          try {
            sink.removeEventListener('loadedmetadata', reportSize);
            sink.removeEventListener('resize', reportSize);
            sink.srcObject = null;
          } catch {
            // A sink that throws is already gone.
          }
        };
        detachers.add(detach);
        return detach;
      },
      onSize(listener) {
        sizeListeners.add(listener);
        return () => void sizeListeners.delete(listener);
      },
      onEnded(listener) {
        endedListeners.add(listener);
        return () => void endedListeners.delete(listener);
      },
    };
    return ok(handle);
  }

  function stop(): void {
    if (state === 'pending') {
      state = 'stopped';
      result = null;
      // The pending start settles now; a stream that arrives later is stopped by `run`.
      settlePending?.(err('camera_stopped'));
      return;
    }
    if (state === 'running') {
      const undo = teardown;
      state = 'stopped';
      result = null;
      undo?.();
    }
  }

  return { start, stop };
}
