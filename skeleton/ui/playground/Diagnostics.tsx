// The diagnostics view (Req 18.6) for the device checks of skeleton-sensors: the event rate over
// the last second (Sensors Device check 2), the frame, Screen angle and compass heading with its
// reported accuracy (Device check 3), the Frame resets (Device check 4), and the Yaw reference
// from a known azimuth with its age, followed by the difference between the reading and a second
// known azimuth (Device checks 1 and 5). Numbers on the screen only; nothing is stored or sent.

import { wrapPi } from '@alidade/core';
import { useState } from 'react';
import {
  COLOURS,
  eventRateHz,
  FailureNotice,
  formatAzimuthDeg,
  formatSignedDeg,
  parseDegrees,
  yawStatus,
  type Session,
  type SessionParameters,
  type UiFailure,
} from '../src/index';

/** The rate is measured over this window: one second. */
const RATE_WINDOW_MS = 1000;

export function Diagnostics({
  session,
  parameters,
}: {
  readonly session: Session | null;
  readonly parameters: SessionParameters;
}) {
  const [secondText, setSecondText] = useState('');
  const [failure, setFailure] = useState<UiFailure | null>(null);
  const [secondRad, setSecondRad] = useState<number | null>(null);
  if (session === null) return null;
  const samples = session.history.samples;
  const nowUtcMs = session.nowUtcMs ?? 0;
  const rate = eventRateHz(
    samples.map((s) => s.timeUtcMs),
    nowUtcMs,
    RATE_WINDOW_MS,
  );
  const newest = samples.reduce<(typeof samples)[number] | null>(
    (a, s) => (a === null || s.timeUtcMs >= a.timeUtcMs ? s : a),
    null,
  );
  const status = yawStatus(
    session.yawReference,
    session.history.frameResets,
    nowUtcMs,
    parameters.yawReferenceMaxAgeMs,
  );
  const reading = session.readout?.azimuth;
  let difference: string | null = null;
  if (secondRad !== null && reading !== undefined && reading.ok) {
    const d = wrapPi(reading.value.azimuthRad - secondRad);
    if (d.ok) difference = `${formatSignedDeg(d.value, 2)}°`;
  }
  const row = { margin: 0 } as const;

  return (
    <section
      data-testid="diagnostics"
      style={{
        fontSize: 20,
        padding: 8,
        background: COLOURS.panel,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <h2 style={{ fontSize: 20, margin: 0 }}>Diagnostics</h2>
      <p
        style={row}
        data-part="rate"
      >{`Orientation events: ${rate.toFixed(1)} Hz over the last second`}</p>
      {newest === null ? (
        <p style={row}>No orientation sample yet.</p>
      ) : (
        <>
          <p style={row} data-part="frame">{`Frame: ${newest.frame}`}</p>
          <p style={row} data-part="screen-angle">
            {`Screen angle: ${newest.screenAngleRad === null ? 'not reported' : `${formatSignedDeg(newest.screenAngleRad, 0)}°`}`}
          </p>
          <p style={row} data-part="heading">
            {`Compass heading: ${newest.magneticHeadingRad === null ? 'not reported' : `${formatAzimuthDeg(newest.magneticHeadingRad, 1)}° magnetic`}, reported accuracy ${newest.compassAccuracyRad === null ? 'not reported' : `${formatSignedDeg(newest.compassAccuracyRad, 1)}°`}`}
          </p>
        </>
      )}
      <p style={row}>Frame resets:</p>
      <ul data-part="resets" style={{ margin: 0 }}>
        {session.history.frameResets.length === 0 ? (
          <li>none</li>
        ) : (
          session.history.frameResets.map((r) => (
            <li
              key={`${r.timeUtcMs}-${r.cause}`}
            >{`${r.cause}, ${((nowUtcMs - r.timeUtcMs) / 1000).toFixed(1)} s ago`}</li>
          ))
        )}
      </ul>
      <p style={row} data-part="yaw">
        {session.yawReference === null
          ? 'North: not set.'
          : `North: ${session.yawReference.northReference}, ±${formatSignedDeg(session.yawReference.sigmaRad, 2)}°, set ${(status.ageMs / 1000).toFixed(0)} s ago, ${status.status}`}
      </p>
      <label style={{ display: 'flex', flexDirection: 'column' }}>
        Known azimuth of a second target, degrees
        <input
          style={{
            height: 48,
            fontSize: 20,
            background: COLOURS.bg,
            color: COLOURS.ink,
            border: `1px solid ${COLOURS.rule}`,
          }}
          inputMode="decimal"
          value={secondText}
          onChange={(e) => {
            setSecondText(e.target.value);
            const parsed = parseDegrees(e.target.value);
            setSecondRad(parsed.ok ? parsed.value : null);
            setFailure(parsed.ok || e.target.value.trim() === '' ? null : parsed);
          }}
        />
      </label>
      <p style={row} data-part="difference">
        {difference === null
          ? 'Reading minus known azimuth: no value yet.'
          : `Reading minus known azimuth: ${difference}`}
      </p>
      {failure !== null && <FailureNotice failure={failure} />}
    </section>
  );
}
