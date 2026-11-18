// The one file of the package that names `navigator.mediaDevices` (Req 1.4, design D10): it builds
// the Camera adapter's surface from the browser's globals. Nothing else reads them.

import type { CameraConstraints, CameraSurface, MediaStreamLike } from './camera-surface';

/** The surface of the running page. Builds nothing that starts the camera. */
export function browserCameraSurface(): CameraSurface {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const getUserMedia =
    devices !== undefined && typeof devices.getUserMedia === 'function'
      ? (constraints: CameraConstraints): Promise<MediaStreamLike> =>
          devices.getUserMedia(constraints)
      : null;
  return { isSecureContext: globalThis.isSecureContext === true, getUserMedia };
}
