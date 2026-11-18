import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UI_REASONS } from '../reasons';
import { messageFor } from '../math/messages';
import { FailureNotice } from './FailureNotice';

describe('FailureNotice (Req 3.6, 21.4)', () => {
  for (const reason of UI_REASONS) {
    it(`shows the Message of ${reason} and neither the code nor the field`, () => {
      const failure = { reason, field: 'someField', id: 'obs-7', errorName: 'WeirdError' };
      const { getByRole, unmount } = render(<FailureNotice failure={failure} />);
      const text = getByRole('alert').textContent ?? '';
      const message = messageFor({ ok: false, reason });
      expect(text).toBe(message.whatHappened + message.whatToDo);
      expect(text).not.toContain(reason);
      expect(text).not.toContain('someField');
      expect(text).not.toContain('obs-7');
      expect(text).not.toContain('WeirdError');
      unmount();
    });
  }

  it('shows the accuracy of a coarse location in the Message', () => {
    const { getByRole } = render(
      <FailureNotice failure={{ reason: 'coarse_location', reportedAccuracyM: 840 }} />,
    );
    expect(getByRole('alert').textContent).toContain('840 m');
  });
});
