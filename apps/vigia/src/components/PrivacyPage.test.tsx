// "What leaves this phone" (Req 15.3, design D20): the table of the requirement, rendered from
// `PRIVACY_TABLE`, one entry for each of its nine rows, each with its four cells.

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRIVACY_TABLE } from '../math/privacy-table';
import { PrivacyPage } from './PrivacyPage';

describe('PrivacyPage (Req 15.3)', () => {
  it('renders the nine rows of PRIVACY_TABLE in order, each with its four cells', () => {
    const { getAllByTestId } = render(<PrivacyPage onBack={() => undefined} />);
    const rows = getAllByTestId('privacy-row');
    expect(PRIVACY_TABLE).toHaveLength(9);
    expect(rows).toHaveLength(9);
    rows.forEach((row, i) => {
      const data = PRIVACY_TABLE[i];
      if (data === undefined) throw new Error('no row');
      // Mira: the channel's name as the card's title, its note in a chip, each cell under its label.
      expect(row.getAttribute('aria-label')).toBe(data.channel);
      expect(data.channel.startsWith(within(row).getByRole('heading').textContent ?? '-')).toBe(
        true,
      );
      expect(row.textContent).toContain(`What leaves the phone${data.whatLeaves}`);
      expect(row.textContent).toContain(`When${data.when}`);
      expect(row.textContent).toContain(`Who sees it${data.whoSees}`);
    });
  });

  it('has Back', () => {
    const calls: string[] = [];
    const { getByRole } = render(<PrivacyPage onBack={() => void calls.push('back')} />);
    fireEvent.click(getByRole('button', { name: 'Back' }));
    expect(calls).toEqual(['back']);
  });
});
