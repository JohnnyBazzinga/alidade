// The bar under the banner in Simulation mode (design §10, D20): what the reviewer holds, the
// scene and its Sight time, with the controls that change them, and the note on the still Sun.

import { COLOURS, FONT_STACK, SIZES } from '@alidade/ui';
import { utcClockText, utcDateText } from '../../math/civil-time';
import { BODY_TEXT_PX, LOOK } from '../look';

export interface SightTimeBarProps {
  readonly scenes: readonly { readonly id: string; readonly name: string }[];
  readonly sceneId: string;
  readonly sightTimesUtcMs: readonly number[];
  readonly sightIndex: number;
  readonly onScene: (sceneId: string) => void;
  readonly onSightIndex: (index: number) => void;
}

export const STILL_SUN_NOTE =
  'The simulated Sun stands still: a sight taken a minute late is up to 15\u2032 off.';

const selectStyle = {
  flex: '1 1 auto',
  boxSizing: 'border-box',
  minHeight: SIZES.touchPx,
  minWidth: SIZES.touchPx,
  fontFamily: FONT_STACK,
  fontSize: BODY_TEXT_PX,
  fontWeight: 700,
  background: COLOURS.raised,
  color: COLOURS.ink,
  border: `1px solid ${COLOURS.brass}`,
  borderRadius: 0,
} as const;

export function SightTimeBar(props: SightTimeBarProps) {
  const { sightTimesUtcMs, sightIndex } = props;
  const time = sightTimesUtcMs[sightIndex] ?? 0;
  const row = {
    ...LOOK.text,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: SIZES.gapPx,
  } as const;
  return (
    <div
      data-testid="phone-bar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx / 2,
        padding: `${SIZES.gapPx / 2}px ${SIZES.gapPx * 1.5}px`,
        background: COLOURS.panel,
        borderBottom: `1px solid ${COLOURS.rule}`,
      }}
    >
      <label style={row}>
        <span style={{ whiteSpace: 'nowrap' }}>Scene</span>
        <select
          value={props.sceneId}
          onChange={(e) => props.onScene(e.target.value)}
          style={selectStyle}
        >
          {props.scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p style={{ ...LOOK.text, fontWeight: 700 }}>
        Sight time {sightIndex + 1} of {sightTimesUtcMs.length}: {utcClockText(time)},{' '}
        {utcDateText(time)} (simulated)
      </p>
      <div style={row}>
        <label style={{ ...row, flex: '1 1 auto' }}>
          <span style={{ whiteSpace: 'nowrap' }}>Sight time</span>
          <select
            value={String(sightIndex)}
            onChange={(e) => props.onSightIndex(Number(e.target.value))}
            style={selectStyle}
          >
            {sightTimesUtcMs.map((t, k) => (
              <option key={t} value={String(k)}>
                {k + 1}: {utcClockText(t)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => props.onSightIndex((sightIndex + 1) % sightTimesUtcMs.length)}
          style={LOOK.button}
        >
          Next sight time
        </button>
      </div>
      <p style={LOOK.dim}>{STILL_SUN_NOTE}</p>
    </div>
  );
}
