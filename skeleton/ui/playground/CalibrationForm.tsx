// The Camera calibration and the tap's 1-sigma (Req 18.3). Every field is empty at the start: the
// package has no default (Req 4.2, 6.2). In device mode the calibration's image size is the
// running stream's size at the moment Apply is pressed, so a later change of aspect ratio is a
// `calibration_mismatch` and not silent. In simulator mode the calibration is the scene's, and
// only the tap's 1-sigma is asked for. An optional requested size is passed to the camera.

import { useState } from 'react';
import {
  checkCalibration,
  FailureNotice,
  parseDegrees,
  type CameraCalibration,
  type FovAxis,
  type SourceSize,
  type UiFailure,
} from '../src/index';

export interface CalibrationChoice {
  /** `null` until a valid one is applied (simulator mode: always `null`, the scene's is used). */
  readonly calibration: CameraCalibration | null;
  /** `NaN` until a valid one is applied. */
  readonly tapSigmaPx: number;
}

export interface CameraRequest {
  readonly idealWidthSourcePx?: number;
  readonly idealHeightSourcePx?: number;
}

export interface CalibrationFormProps {
  readonly mode: 'device' | 'simulator';
  /** The running stream's size; `null` while no camera runs. */
  readonly streamSize: SourceSize | null;
  readonly onApply: (choice: CalibrationChoice) => void;
  readonly onRequestSize?: (request: CameraRequest) => void;
}

/** A non-negative decimal number of pixels, or `null`. */
function parsePixels(text: string): number | null {
  const trimmed = text.trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const field = {
  boxSizing: 'border-box',
  height: 48,
  minWidth: 48,
  width: '100%',
  fontSize: 20,
  fontFamily: 'inherit',
  background: '#0C0F12',
  color: '#ECE8DC',
  border: '1px solid #6A7884',
  borderRadius: 0,
} as const;
const button = {
  boxSizing: 'border-box',
  minHeight: 48,
  minWidth: 48,
  fontSize: 20,
  fontFamily: 'inherit',
  background: '#1D252C',
  color: '#ECE8DC',
  border: '1px solid #6A7884',
  borderRadius: 0,
  padding: '0 16px',
} as const;

export function CalibrationForm({
  mode,
  streamSize,
  onApply,
  onRequestSize,
}: CalibrationFormProps) {
  const [fovText, setFovText] = useState('');
  const [axis, setAxis] = useState<FovAxis>('diagonal');
  const [fovSigmaText, setFovSigmaText] = useState('');
  const [tapText, setTapText] = useState('');
  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [failure, setFailure] = useState<UiFailure | null>(null);
  const [applied, setApplied] = useState(false);

  const apply = (): void => {
    const tapSigmaPx = parsePixels(tapText);
    if (tapSigmaPx === null) {
      setApplied(false);
      setFailure({ ok: false, reason: 'invalid_number', field: 'tapSigmaPx' });
      onApply({ calibration: null, tapSigmaPx: Number.NaN });
      return;
    }
    if (mode === 'simulator') {
      setFailure(null);
      setApplied(true);
      onApply({ calibration: null, tapSigmaPx });
      return;
    }
    const fov = parseDegrees(fovText);
    const fovSigma = parseDegrees(fovSigmaText);
    if (!fov.ok || !fovSigma.ok || streamSize === null) {
      setApplied(false);
      setFailure(
        streamSize === null && fov.ok && fovSigma.ok
          ? { ok: false, reason: 'calibration_missing' }
          : { ok: false, reason: 'invalid_number' },
      );
      onApply({ calibration: null, tapSigmaPx });
      return;
    }
    const checked = checkCalibration({
      fovRad: fov.value,
      fovAxis: axis,
      fovSigmaRad: fovSigma.value,
      imageWidthSourcePx: streamSize.widthSourcePx,
      imageHeightSourcePx: streamSize.heightSourcePx,
    });
    setApplied(checked.ok);
    setFailure(checked.ok ? null : checked);
    onApply({ calibration: checked.ok ? checked.value : null, tapSigmaPx });
  };

  const requestSize = (): void => {
    const width = parsePixels(widthText);
    const height = parsePixels(heightText);
    onRequestSize?.({
      ...(width !== null && width > 0 ? { idealWidthSourcePx: width } : {}),
      ...(height !== null && height > 0 ? { idealHeightSourcePx: height } : {}),
    });
  };

  return (
    <fieldset
      data-testid="calibration-form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: '1px solid #6A7884',
        fontSize: 20,
      }}
    >
      <legend>{mode === 'device' ? 'Camera calibration' : 'Tap accuracy'}</legend>
      {mode === 'device' && (
        <>
          <label>
            Field of view, degrees
            <input
              style={field}
              inputMode="decimal"
              value={fovText}
              onChange={(e) => setFovText(e.target.value)}
            />
          </label>
          <label>
            Measured along
            <select
              style={field}
              value={axis}
              onChange={(e) =>
                setAxis(
                  e.target.value === 'width'
                    ? 'width'
                    : e.target.value === 'height'
                      ? 'height'
                      : 'diagonal',
                )
              }
            >
              <option value="diagonal">the diagonal</option>
              <option value="width">the width</option>
              <option value="height">the height</option>
            </select>
          </label>
          <label>
            Its 1-sigma, degrees
            <input
              style={field}
              inputMode="decimal"
              value={fovSigmaText}
              onChange={(e) => setFovSigmaText(e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Tap 1-sigma, CSS pixels
        <input
          style={field}
          inputMode="decimal"
          value={tapText}
          onChange={(e) => setTapText(e.target.value)}
        />
      </label>
      <button type="button" style={button} onClick={apply}>
        Apply
      </button>
      <p data-testid="calibration-state" style={{ margin: 0 }}>
        {applied
          ? 'Applied.'
          : mode === 'device'
            ? 'Not applied: the crosshair works, a tapped point needs these values.'
            : 'Not applied: a tapped point needs the tap 1-sigma.'}
      </p>
      {failure !== null && <FailureNotice failure={failure} />}
      {mode === 'device' && (
        <>
          <label>
            Requested camera width, source pixels (optional)
            <input
              style={field}
              inputMode="numeric"
              value={widthText}
              onChange={(e) => setWidthText(e.target.value)}
            />
          </label>
          <label>
            Requested camera height, source pixels (optional)
            <input
              style={field}
              inputMode="numeric"
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
            />
          </label>
          <button type="button" style={button} onClick={requestSize}>
            Use this size at the next start
          </button>
        </>
      )}
    </fieldset>
  );
}
