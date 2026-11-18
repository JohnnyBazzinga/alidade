import {
  BearingModel,
  ellipse95,
  initialAzimuthRad,
  solve,
  unprojectToLocalPlane,
  type Bearing,
  type Fix,
  type Position,
} from '@alidade/core';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { FixSummary } from './FixSummary';

const ORIGIN: Position = { latRad: (30 * Math.PI) / 180, lonRad: (-40 * Math.PI) / 180 };
const at = (eastM: number, northM: number): Position => {
  const p = unprojectToLocalPlane(ORIGIN, { eastM, northM });
  if (!p.ok) throw new Error('position');
  return p.value;
};
const TARGET = at(0, 3000);
function bearing(id: string, observer: Position, sigmaRad = 0.02): Bearing {
  const az = initialAzimuthRad(observer, TARGET);
  if (!az.ok) throw new Error('azimuth');
  return {
    id,
    observer,
    positionAccuracyM: 5,
    timeUtcMs: 1,
    azimuthRad: az.value,
    azimuthSigmaRad: sigmaRad,
  };
}
const solved = (bs: readonly Bearing[]) => solve(new BearingModel(), bs);

describe('FixSummary (Req 18.4, 13.6)', () => {
  it('shows the number of Bearings, the position and the 95 % semi-axes in metres', () => {
    const result = solved([
      bearing('a', at(-800, 0)),
      bearing('b', at(800, 0)),
      bearing('c', at(0, -500)),
    ]);
    if (!result.ok) throw new Error(result.reason);
    const e = ellipse95(result.value.ellipse);
    if (!e.ok) throw new Error('ellipse');
    const { getByTestId } = render(<FixSummary fix={result} />);
    const latDeg = ((result.value.position.latRad * 180) / Math.PI).toFixed(4);
    const lonDeg = ((-result.value.position.lonRad * 180) / Math.PI).toFixed(4);
    expect(getByTestId('fix-summary').textContent).toBe(
      `Fix from 3 bearings: ${latDeg}° N, ${lonDeg}° W. ` +
        `95 % ellipse: semi-axes ${Math.round(e.value.semiMajorM)} m and ${Math.round(e.value.semiMinorM)} m.`,
    );
  });

  it('counts the Bearings the solver used, not those it was given', () => {
    const result = solved([bearing('a', at(-800, 0)), bearing('b', at(800, 0))]);
    if (!result.ok) throw new Error(result.reason);
    const { getByTestId } = render(<FixSummary fix={result} />);
    expect(getByTestId('fix-summary').textContent).toMatch(/^Fix from 2 bearings: /);
    expect(result.value.residuals).toHaveLength(2);
  });

  it('shows the Message of the failure of solve', () => {
    // Two observers at the same place: Core refuses the geometry.
    const result = solved([bearing('a', at(0, 0)), bearing('b', at(0, 0))]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const { getByRole, queryByTestId } = render(<FixSummary fix={result} />);
    const m = messageFor(result);
    expect(getByRole('alert').textContent).toBe(m.whatHappened + m.whatToDo);
    expect(queryByTestId('fix-summary')).toBeNull();
  });

  it('shows the Message of the failure when the Ellipse cannot be drawn at 95 %', () => {
    const result = solved([bearing('a', at(-800, 0)), bearing('b', at(800, 0))]);
    if (!result.ok) throw new Error(result.reason);
    const broken: Fix = {
      ...result.value,
      ellipse: { ...result.value.ellipse, semiMajorM: Number.NaN },
    };
    const { getByRole, queryByTestId } = render(<FixSummary fix={{ ok: true, value: broken }} />);
    expect(getByRole('alert').textContent).toBeTruthy();
    expect(queryByTestId('fix-summary')).toBeNull();
  });

  it('does not accept a Position in place of a Fix (type level, Req 13.6)', () => {
    // Checked by `pnpm typecheck`: the directive fails the build if the line below it compiles.
    const props: ComponentProps<typeof FixSummary> = {
      // @ts-expect-error a Position has no covariance and no Ellipse, so it is not a Fix
      fix: { ok: true, value: ORIGIN },
    };
    expect(props).toBeDefined();
  });
});
