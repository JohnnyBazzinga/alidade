// The bar under the banner in Simulation mode (design §10, D20; task group 13, A): what the
// reviewer holds, in one row that never wraps: the scene chooser, the sight-time chooser and a
// short Next. The full Sight time and the note on the still Sun are on the Sight screen, in its
// scrolling part (`SightTimeNote`).

import { BODY_FONT_STACK, COLOURS, SIZES } from '@alidade/ui';
import { utcClockText, utcDateText } from '../../math/civil-time';
import { BODY_TEXT_PX, LOOK } from '../look';

export interface SightTimeBarProps {
  readonly scenes: readonly { readonly id: string; readonly shortName: string }[];
  readonly sceneId: string;
  readonly sightTimesUtcMs: readonly number[];
  readonly sightIndex: number;
  readonly onScene: (sceneId: string) => void;
  readonly onSightIndex: (index: number) => void;
}

export const STILL_SUN_NOTE =
  'The simulated Sun stands still: a sight taken a minute late is up to 15\u2032 off.';

const selectStyle = {
  flex: '1 1 0',
  minWidth: 0,
  boxSizing: 'border-box',
  minHeight: SIZES.touchPx,
  fontFamily: BODY_FONT_STACK,
  fontSize: BODY_TEXT_PX,
  fontWeight: 700,
  background: COLOURS.raised,
  color: COLOURS.ink,
  border: `1px solid ${COLOURS.brass}`,
  borderRadius: 0,
  textOverflow: 'ellipsis',
} as const;

export function SightTimeBar(props: SightTimeBarProps) {
  const { sightTimesUtcMs, sightIndex } = props;
  const count = sightTimesUtcMs.length;
  return (
    <div
      data-testid="phone-bar"
      style={{
        padding: `${SIZES.gapPx / 2}px ${SIZES.gapPx * 1.5}px`,
        background: COLOURS.panel,
        borderBottom: `1px solid ${COLOURS.rule}`,
      }}
    >
      <div
        data-part="bar-row"
        style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: SIZES.gapPx }}
      >
        <select
          aria-label="Scene"
          value={props.sceneId}
          onChange={(e) => props.onScene(e.target.value)}
          style={selectStyle}
        >
          {props.scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shortName}
            </option>
          ))}
        </select>
        <select
          aria-label="Sight time"
          value={String(sightIndex)}
          onChange={(e) => props.onSightIndex(Number(e.target.value))}
          style={selectStyle}
        >
          {sightTimesUtcMs.map((t, k) => (
            <option key={t} value={String(k)}>
              {`${k + 1}/${count} ${utcClockText(t).replace(' UTC', '')}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Next sight time"
          onClick={() => props.onSightIndex((sightIndex + 1) % count)}
          style={{ ...LOOK.button, flex: '0 0 auto' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** The full Sight time, and the note on the still Sun: on the Sight screen, in its scrolling part. */
export function SightTimeNote(props: {
  readonly sightTimesUtcMs: readonly number[];
  readonly sightIndex: number;
}) {
  const time = props.sightTimesUtcMs[props.sightIndex] ?? 0;
  return (
    <div data-testid="sight-time-note" style={{ ...LOOK.panel, margin: SIZES.gapPx }}>
      <p style={{ ...LOOK.text, fontWeight: 700 }}>
        Sight time {props.sightIndex + 1} of {props.sightTimesUtcMs.length}: {utcClockText(time)},{' '}
        {utcDateText(time)} (simulated)
      </p>
      <p style={LOOK.dim}>{STILL_SUN_NOTE}</p>
    </div>
  );
}
