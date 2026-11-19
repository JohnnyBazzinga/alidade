// The Emergency screen (design §9, §7.12; Req 14.2 to 14.7). First that the app calls no one;
// then the text to read out or paste, at readout size and selectable, made from the store's
// assessment when it changes (with the time it was made in its last line), so that no text of an
// earlier Fix stays on the screen; Copy, which on a failure leaves the whole text selected and
// says `clipboard_unavailable`; the own-position switch, off by default.

import { useMemo, useRef, useState } from 'react';
import { checkStatement } from '../math/assessment/statements';
import { emergencyText } from '../math/fix/emergency-text';
import { EMERGENCY_NOT_CALLING_TEXT } from '../math/texts';
import type { VigiaFailure } from '../result';
import { COLOURS } from '@alidade/ui';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useVigia } from './store';

export function EmergencyScreen() {
  const environment = useEnvironment();
  const { open, ownPosition } = useVigia();
  const [includeOwnPosition, setIncludeOwnPosition] = useState(false);
  const [copy, setCopy] = useState<'done' | VigiaFailure | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const assessment = open !== null && open.assessment.ok ? open.assessment.value : null;
  const simulation = environment.mode === 'simulation';

  const text = useMemo(() => {
    if (assessment === null || assessment.used.length === 0) return null;
    return emergencyText(
      {
        assessment,
        nowUtcMs: environment.clock(),
        mode: environment.mode,
        ownPosition,
        includeOwnPosition,
      },
      environment.parameters,
    );
  }, [assessment, ownPosition, includeOwnPosition, environment]);

  const onCopy = (value: string) => {
    void environment.clipboard.copyText(value).then((result) => {
      if (result.ok) {
        setCopy('done');
        return;
      }
      setCopy(result);
      const element = area.current;
      if (element !== null) {
        element.focus();
        element.select();
      }
    });
  };

  return (
    <section data-testid="emergency-screen" style={LOOK.stack}>
      <p style={{ ...LOOK.readout, fontWeight: 700 }}>{EMERGENCY_NOT_CALLING_TEXT}</p>
      {open !== null && !open.assessment.ok && <FailureNotice failure={open.assessment} />}
      {text === null && <p style={LOOK.text}>{checkStatement('none')}</p>}
      {text !== null && !text.ok && <FailureNotice failure={text} />}
      {text !== null && text.ok && (
        <>
          <label htmlFor="vigia-emergency-text" style={LOOK.title}>
            Text for the emergency call
          </label>
          <textarea
            id="vigia-emergency-text"
            ref={area}
            readOnly
            value={text.value}
            rows={text.value.split('\n').length + 4}
            style={{
              ...LOOK.readout,
              width: '100%',
              boxSizing: 'border-box',
              padding: 8,
              resize: 'vertical',
              background: COLOURS.panel,
              border: `1px solid ${COLOURS.rule}`,
              userSelect: 'text',
            }}
          />
          <div data-testid="copy-box" style={LOOK.stack}>
            {copy !== null && copy !== 'done' && <FailureNotice failure={copy} />}
            {copy === 'done' && (
              <p role="status" style={LOOK.dim}>
                Copied. Paste it or read it out.
              </p>
            )}
            <button type="button" onClick={() => onCopy(text.value)} style={LOOK.primaryButton}>
              {simulation ? 'Copy the simulation text' : 'Copy the text'}
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={includeOwnPosition}
            aria-label="Include my own position"
            onClick={() => {
              setIncludeOwnPosition((v) => !v);
              setCopy(null);
            }}
            style={{ ...LOOK.button, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Include my own position</span>
            <span style={{ color: includeOwnPosition ? COLOURS.brass : COLOURS.inkDim }}>
              {includeOwnPosition ? 'On' : 'Off'}
            </span>
          </button>
          {includeOwnPosition && ownPosition === null && (
            <p style={LOOK.dim}>
              This phone has taken no sighting, so it has no position of its own to add.
            </p>
          )}
        </>
      )}
    </section>
  );
}
