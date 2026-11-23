// The app mark (Req 22.2, design D25.4): a smoke cloud inside four viewfinder brackets. Decorative:
// hidden from assistive technology; every paint is a role in `style`.

import { ROLE_VARS } from '@alidade/ui';

export function AppMark({ sizePx = 40 }: { readonly sizePx?: number }) {
  return (
    <svg
      data-art="mark"
      aria-hidden="true"
      focusable="false"
      width={sizePx}
      height={sizePx}
      viewBox="0 0 48 48"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <g
        style={{ fill: 'none', stroke: ROLE_VARS.primary, strokeWidth: 4, strokeLinecap: 'round' }}
      >
        <path d="M5 15V5h10" />
        <path d="M33 5h10v10" />
        <path d="M43 33v10H33" />
        <path d="M15 43H5V33" />
      </g>
      <g style={{ fill: ROLE_VARS.headerInk }}>
        <circle cx="19" cy="27" r="6" />
        <circle cx="25.5" cy="22" r="7.5" />
        <circle cx="31.5" cy="27.5" r="5.5" />
        <rect x="18" y="27" width="14" height="6" rx="3" />
      </g>
    </svg>
  );
}
