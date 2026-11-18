// The camera image (Req 10.4, design D11): the stream attached to a video element. While the
// Session is frozen the video is paused, which keeps the frame that was on screen (Device check 4
// decides whether that is enough on every browser).

import { useEffect, useRef } from 'react';
import type { CameraStream } from '../adapters/camera/camera-adapter';
import type { VideoSink } from '../adapters/camera/camera-surface';
import type { ImageFit } from '../math/image-layout';

export interface CameraImageProps {
  readonly stream: CameraStream | null;
  readonly frozen: boolean;
  readonly fit: ImageFit;
  /** Wraps the element as a `VideoSink`; the default is the element itself. Tests inject a fake. */
  readonly sinkFor?: (element: HTMLVideoElement) => VideoSink;
}

export function CameraImage({ stream, frozen, fit, sinkFor }: CameraImageProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const sink = useRef<VideoSink | null>(null);
  const wasFrozen = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null || stream === null) return undefined;
    const target: VideoSink = sinkFor === undefined ? element : sinkFor(element);
    sink.current = target;
    const detach = stream.attach(target);
    wasFrozen.current = false;
    return () => {
      detach();
      sink.current = null;
    };
  }, [stream, sinkFor]);

  useEffect(() => {
    const target = sink.current;
    if (target !== null && frozen !== wasFrozen.current) {
      if (frozen) target.pause();
      else void target.play();
    }
    wasFrozen.current = frozen;
  }, [frozen, stream]);

  return (
    <video
      ref={ref}
      data-testid="camera-video"
      playsInline
      muted
      style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
    />
  );
}
