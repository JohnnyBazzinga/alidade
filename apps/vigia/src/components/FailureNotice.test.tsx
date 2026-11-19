// Vigia's FailureNotice (Req 2.3, 2.5, 21.4): every reason of the closed set is shown through
// `messageFor`, with neither the reason's code nor the field, id or error name on the screen.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { VIGIA_REASONS } from '../reasons';
import { FailureNotice } from './FailureNotice';

describe('FailureNotice (Req 2.3, 21.4)', () => {
  it('knows the 69 reasons of the closed set', () => {
    expect(VIGIA_REASONS).toHaveLength(69);
  });

  for (const reason of VIGIA_REASONS) {
    it(`shows ${reason} through messageFor, without its code, field, id or error name`, () => {
      const failure = {
        ok: false as const,
        reason,
        field: 'fieldNameX',
        id: 'IDENTITY9',
        errorName: 'ErrorNameX',
      };
      const { getByRole } = render(<FailureNotice failure={failure} />);
      const shown = getByRole('alert').textContent ?? '';
      const message = messageFor(failure);
      expect(shown).toBe(`${message.whatHappened} ${message.whatToDo}`);
      expect(shown).not.toContain(reason);
      for (const hidden of ['fieldNameX', 'IDENTITY9', 'ErrorNameX', '_']) {
        expect(shown).not.toContain(hidden);
      }
    });
  }

  it('says what was left out when a count is given', () => {
    const { getByRole } = render(
      <FailureNotice failure={{ ok: false, reason: 'storage_corrupt' }} count={3} />,
    );
    expect(getByRole('alert').textContent).toContain('3 saved sightings were left out.');
  });
});
