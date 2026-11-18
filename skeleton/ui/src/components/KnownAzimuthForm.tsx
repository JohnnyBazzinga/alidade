// "Set north from a known azimuth" (Req 11.1, 18.4): the user types the true azimuth of a Sun or a
// landmark and the 1-sigma of that value, both in degrees. A number that is not one is refused
// here, with the Message of `invalid_number`, before anything is sent to the Session.

import { useState } from 'react';
import type { YawSource } from '../math/session/session-events';
import { parseDegrees } from '../math/display-format';
import type { UiFailure } from '../result';
import { controlStyle } from './ControlBar';
import { FailureNotice } from './FailureNotice';
import { COLOURS, FONT_STACK, SIZES } from './theme';

export interface KnownAzimuthFormProps {
  readonly onSubmit: (from: Extract<YawSource, { kind: 'knownAzimuth' }>) => void;
}

const inputStyle = {
  boxSizing: 'border-box',
  minHeight: SIZES.touchPx,
  height: SIZES.touchPx,
  minWidth: SIZES.touchPx,
  width: '100%',
  fontFamily: FONT_STACK,
  fontSize: SIZES.labelPx,
  background: COLOURS.bg,
  color: COLOURS.ink,
  border: `1px solid ${COLOURS.rule}`,
  borderRadius: 0,
} as const;

export function KnownAzimuthForm({ onSubmit }: KnownAzimuthFormProps) {
  const [azimuthText, setAzimuthText] = useState('');
  const [sigmaText, setSigmaText] = useState('');
  const [reference, setReference] = useState<'true' | 'magnetic'>('true');
  const [failure, setFailure] = useState<UiFailure | null>(null);

  const submit = (): void => {
    const azimuth = parseDegrees(azimuthText);
    if (!azimuth.ok) return setFailure({ ...azimuth, field: 'azimuth' });
    const sigma = parseDegrees(sigmaText);
    if (!sigma.ok) return setFailure({ ...sigma, field: 'sigma' });
    setFailure(null);
    onSubmit({
      kind: 'knownAzimuth',
      azimuthRad: azimuth.value,
      sigmaRad: sigma.value,
      northReference: reference,
    });
  };

  return (
    <div
      data-testid="known-azimuth-form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx,
        padding: SIZES.gapPx,
        fontFamily: FONT_STACK,
        fontSize: SIZES.labelPx,
        color: COLOURS.ink,
        background: COLOURS.panel,
      }}
    >
      <label>
        Known azimuth, degrees
        <input
          style={inputStyle}
          inputMode="decimal"
          value={azimuthText}
          onChange={(e) => setAzimuthText(e.target.value)}
        />
      </label>
      <label>
        Its 1-sigma, degrees
        <input
          style={inputStyle}
          inputMode="decimal"
          value={sigmaText}
          onChange={(e) => setSigmaText(e.target.value)}
        />
      </label>
      <label>
        Measured from
        <select
          style={inputStyle}
          value={reference}
          onChange={(e) => setReference(e.target.value === 'magnetic' ? 'magnetic' : 'true')}
        >
          <option value="true">true north</option>
          <option value="magnetic">magnetic north</option>
        </select>
      </label>
      <button type="button" style={controlStyle(false)} onClick={submit}>
        Set north from this azimuth
      </button>
      {failure !== null && <FailureNotice failure={failure} />}
    </div>
  );
}
