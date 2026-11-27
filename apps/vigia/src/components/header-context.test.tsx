// A view sets the App's header while it is shown (Req 22.2, 22.9, 22.10; task 24.3, 24.6).

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QR_VIEW_TITLE, QUESTION_TITLE } from '../math/texts';
import { HeaderProvider, useHeader, type HeaderSpec } from './header-context';

function Probe({ spec }: { readonly spec: HeaderSpec | null }) {
  const inApp = useHeader(spec);
  return <p data-testid="probe">{inApp ? 'in the app' : 'alone'}</p>;
}

describe('useHeader', () => {
  it('sets the header while the view is shown and gives it back when it goes', () => {
    const seen: (HeaderSpec | null)[] = [];
    const { rerender, unmount, getByTestId } = render(
      <HeaderProvider value={(s) => void seen.push(s)}>
        <Probe spec={{ variant: 'compact', title: QUESTION_TITLE }} />
      </HeaderProvider>,
    );
    expect(getByTestId('probe').textContent).toBe('in the app');
    expect(seen.at(-1)).toEqual({ variant: 'compact', title: 'New sighting' });
    rerender(
      <HeaderProvider value={(s) => void seen.push(s)}>
        <Probe spec={null} />
      </HeaderProvider>,
    );
    expect(seen.at(-1)).toBeNull();
    unmount();
  });

  it('alone (a view\u2019s test), it says so and sets nothing', () => {
    const { getByTestId } = render(<Probe spec={{ variant: 'compact', title: QR_VIEW_TITLE }} />);
    expect(getByTestId('probe').textContent).toBe('alone');
  });
});

const SOURCES = import.meta.glob<string>(['./ConfirmSmokeDialog.tsx', './ShareSheet.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('the views that set a title (Req 22.9, 22.10)', () => {
  // Mira (Req 22.2 as amended 2026-11-27): the question has no App header and says its own title;
  // the QR view says "QR code" itself.
  it('the question asks for no header; the QR view says "QR code" in its own title', () => {
    expect(SOURCES['./ConfirmSmokeDialog.tsx']).toContain("useHeader({ variant: 'none' })");
    expect(SOURCES['./ConfirmSmokeDialog.tsx']).toContain('Is this the same smoke as before?');
    expect(SOURCES['./ShareSheet.tsx']).toContain('{QR_VIEW_TITLE}</h1>');
  });
});
