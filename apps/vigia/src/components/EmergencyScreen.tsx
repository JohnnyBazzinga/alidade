// The Emergency screen (design §9, §7.12; Req 14.2 to 14.7). First that the app calls no one;
// then the text to read out or paste, at readout size and selectable, made from the store's
// assessment when it changes (with the time it was made in its last line), so that no text of an
// earlier Fix stays on the screen; Copy, which on a failure leaves the whole text selected and
// says `clipboard_unavailable`; the own-position switch, off by default.
//
// Task 21.2: the text is shown whole, in the page's flow, with its lines kept (on a phone a box of
// fixed height showed only its first half, and it is the text a person reads aloud on a call).
// Task 21.3: Copy, with what it did, is in the App's row above the tabs.

import { useMemo, useRef, useState } from 'react';
import { checkStatement } from '../math/assessment/statements';
import { emergencyText } from '../math/fix/emergency-text';
import { EMERGENCY_NOT_CALLING_TEXT } from '../math/texts';
import type { VigiaFailure } from '../result';
import { COLOURS, SIZES } from '@alidade/ui';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { PrimaryAction } from './PrimaryAction';
import { useVigia } from './store';

export function EmergencyScreen() {
  const environment = useEnvironment();
  const { open, ownPosition } = useVigia();
  const [includeOwnPosition, setIncludeOwnPosition] = useState(false);
  const [copy, setCopy] = useState<'done' | VigiaFailure | null>(null);
  const block = useRef<HTMLPreElement | null>(null);
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
      // The whole text selected, so that the user can copy it by hand (Req 14.4).
      const element = block.current;
      const selection = element?.ownerDocument.getSelection() ?? null;
      if (element !== null && selection !== null) selection.selectAllChildren(element);
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
          <h2 id="vigia-emergency-text-title" style={LOOK.title}>
            Text for the emergency call
          </h2>
          <pre
            ref={block}
            aria-labelledby="vigia-emergency-text-title"
            style={{
              ...LOOK.readout,
              whiteSpace: 'pre-wrap',
              userSelect: 'text',
              padding: SIZES.gapPx,
              background: COLOURS.panel,
              border: `1px solid ${COLOURS.rule}`,
            }}
          >
            {text.value}
          </pre>
          <button
            type="button"
            role="switch"
            aria-checked={includeOwnPosition}
            aria-label="Include where I took my last sighting"
            onClick={() => {
              setIncludeOwnPosition((v) => !v);
              setCopy(null);
            }}
            style={{
              ...LOOK.button,
              overflowWrap: 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: SIZES.gapPx * 2,
              textAlign: 'left',
            }}
          >
            <span data-part="switch-label" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
              Include where I took my last sighting
            </span>
            <span
              data-part="switch-state"
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                fontWeight: 700,
                color: includeOwnPosition ? COLOURS.brass : COLOURS.inkDim,
              }}
            >
              {includeOwnPosition ? 'On' : 'Off'}
            </span>
          </button>
          {includeOwnPosition && ownPosition === null && (
            <p style={LOOK.dim}>
              This phone has taken no sighting, so it has no position of its own to add.
            </p>
          )}
          <PrimaryAction>
            <div data-testid="copy-box" style={LOOK.stack}>
              {copy !== null && copy !== 'done' && <FailureNotice failure={copy} />}
              {copy === 'done' && (
                <p role="status" style={LOOK.dim}>
                  Copied. Paste it or read it out.
                </p>
              )}
              <button
                type="button"
                data-primary="true"
                onClick={() => onCopy(text.value)}
                style={LOOK.primaryButton}
              >
                {simulation ? 'Copy the simulation text' : 'Copy the text'}
              </button>
            </div>
          </PrimaryAction>
        </>
      )}
    </section>
  );
}
