// The picture in the lens's place before Start (Req 22.8 as amended 2026-11-27, skeleton-ui Req
// 22.15; design D26.4): Mira's landscape, a ridge of mountains, a forest with a lookout tower and a
// column of smoke rising from a small fire, with the crosshair on its base, the thing the user is
// about to sight. It is `mira-landscape.svg` (the lead's design: no text, no link, no place that
// exists), carried in the script and drawn as a `data:` URL, so that the page asks for no image
// (Req 11.1); the skeleton draws it in a circle. Decorative: hidden from assistive technology.

import landscapeSvg from './mira-landscape.svg?raw';

const ENCODED = encodeURIComponent(landscapeSvg);

export function IdleScene() {
  return (
    <img
      data-art="idle-scene"
      src={`data:image/svg+xml;charset=utf-8,${ENCODED}`}
      alt=""
      aria-hidden="true"
      width={232}
      height={232}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
