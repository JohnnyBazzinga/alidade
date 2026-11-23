// The Yaw status (Req 11.4): whether north is set, how old it is, its North reference and
// 1-sigma, and, when it is stale or lost, what the user is told to do (the Message of
// `stale_yaw_reference` or `frame_reset`). With no Yaw reference the frame decides: on the
// Relative frame north is not set (the Message of `no_yaw_reference`); on the Absolute frame the
// phone's own compass gives north (Req 9.2), with the heading 1-sigma of the parameters, and
// setting north on the Sun or a landmark only reduces its error.

import type { OrientationFrame, YawReference } from '@alidade/sensors';
import { formatSignedDeg } from '../math/display-format';
import { messageFor } from '../math/messages';
import type { YawStatus } from '../math/session/yaw-status';
import { StatusCard } from './StatusCard';
import { COLOURS, NUMERAL_STYLE } from './theme';
import { useActiveTheme } from './theme/apply-theme';

export interface YawStatusBarProps {
  readonly status: YawStatus;
  readonly yawReference: YawReference | null;
  /** The frame of the newest sample; `null` before the first. */
  readonly frame: OrientationFrame | null;
  /** The heading 1-sigma of the Session parameters: the phone compass's, on the Absolute frame. */
  readonly headingSigmaRad: number;
  /** The line without its prompt: for "Details" in the docked layout (Req 13.16). */
  readonly lineOnly?: boolean;
}

export const ABSOLUTE_NONE_PROMPT = 'Setting north on the Sun or a landmark reduces the error.';

/** "42 s" under two minutes, else whole minutes. */
export function formatAge(ageMs: number): string {
  const s = Math.round(Math.max(0, ageMs) / 1000);
  return s < 120 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export function YawStatusBar({
  status,
  yawReference,
  frame,
  headingSigmaRad,
  lineOnly = false,
}: YawStatusBarProps) {
  const cards = useActiveTheme().flags.cards;
  const age = formatAge(status.ageMs);
  const detail =
    yawReference === null
      ? ''
      : ` ${yawReference.northReference} north, ±${formatSignedDeg(yawReference.sigmaRad, 1)}°`;
  let line: string;
  let prompt: string | null = null;
  /** The Absolute frame's advice is not a warning: it is drawn without the alert colour. */
  let advice = false;
  switch (status.status) {
    case 'none':
      if (frame === 'absolute') {
        line = `North comes from the phone\u2019s compass, 1-sigma ±${formatSignedDeg(headingSigmaRad, 1)}°.`;
        prompt = ABSOLUTE_NONE_PROMPT;
        advice = true;
      } else {
        line = 'North is not set.';
        prompt = promptText('no_yaw_reference');
      }
      break;
    case 'valid':
      line = `North set ${age} ago,${detail}.`;
      break;
    case 'stale':
      line = `North set ${age} ago,${detail}.`;
      prompt = promptText('stale_yaw_reference');
      break;
    case 'invalidated':
      line = `North set ${age} ago was lost.`;
      prompt = promptText('frame_reset');
      break;
  }
  // A status card (Req 22.13): set north, or the compass's advice, is information; the rest is a
  // warning. In Instrument the line is in ink and the prompt in the alert colour, as before; in a
  // theme with cards the line is the bold headline in the tone's ink and the prompt the rest.
  const tone = status.status === 'valid' || advice ? 'info' : 'warning';
  const shown = prompt !== null && !lineOnly;
  return (
    <StatusCard
      tone={tone}
      testId="yaw-status"
      data={{ status: status.status }}
      style={{
        fontVariantNumeric: NUMERAL_STYLE.fontVariantNumeric,
        letterSpacing: NUMERAL_STYLE.letterSpacing,
        lineHeight: 1.25,
      }}
      headline={<span data-part="line">{line}</span>}
      {...(cards ? {} : { headlineColour: COLOURS.ink })}
      {...(cards ? {} : { bodyColour: advice ? COLOURS.inkDim : COLOURS.alert })}
    >
      {shown ? <span data-part="prompt">{prompt}</span> : null}
    </StatusCard>
  );
}

function promptText(reason: 'no_yaw_reference' | 'stale_yaw_reference' | 'frame_reset'): string {
  const m = messageFor({ ok: false, reason });
  return `${m.whatHappened} ${m.whatToDo}`;
}
