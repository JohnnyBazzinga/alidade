// The Fix in words (Req 18.4): the number of Bearings the solver used, the position, and the
// semi-axes of the 95 % ellipse in metres; or the Message of the failure. It takes the result of
// Core's `solve`, whose value is a Fix with its covariance and Ellipse, so it cannot be given a
// position without its uncertainty (Req 13.6). The ellipse is Core's `ellipse95`, as on the map.

import { ellipse95, type Fix } from '@alidade/core';
import { formatSignedDeg } from '../math/display-format';
import type { UiResult } from '../result';
import { FailureNotice } from './FailureNotice';
import { COLOURS, FONT_STACK, NUMERAL_STYLE, SIZES } from './theme';

/** Latitudes and longitudes to 1e-4°, about 11 m: the most the display module prints (D25.4). */
const POSITION_DECIMALS = 4;

function hemisphere(angleRad: number, positive: string, negative: string): string {
  return `${formatSignedDeg(Math.abs(angleRad), POSITION_DECIMALS)}° ${angleRad < 0 ? negative : positive}`;
}

export function FixSummary({ fix }: { readonly fix: UiResult<Fix> }) {
  if (!fix.ok) return <FailureNotice failure={fix} />;
  const e = ellipse95(fix.value.ellipse);
  if (!e.ok) return <FailureNotice failure={e} />;
  const count = fix.value.residuals.length;
  const { latRad, lonRad } = fix.value.position;
  const text =
    `Fix from ${count} bearing${count === 1 ? '' : 's'}: ` +
    `${hemisphere(latRad, 'N', 'S')}, ${hemisphere(lonRad, 'E', 'W')}. ` +
    `95 % ellipse: semi-axes ${Math.round(e.value.semiMajorM)} m and ${Math.round(e.value.semiMinorM)} m.`;
  return (
    <p
      data-testid="fix-summary"
      style={{
        ...NUMERAL_STYLE,
        margin: 0,
        padding: SIZES.gapPx,
        fontFamily: FONT_STACK,
        fontSize: SIZES.labelPx,
        color: COLOURS.ink,
        background: COLOURS.panel,
      }}
    >
      {text}
    </p>
  );
}
