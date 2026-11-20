// The screen's primary action, where the thumb is (design §9; task 21.3). The App keeps a row of
// its own between the part of the screen that scrolls and the tab bar, in the column: not a layer
// over anything. A screen puts its primary action there with `<PrimaryAction>`, which renders its
// children into that row through a portal, so that the action keeps the screen's state and
// handlers. Outside an App (a component test of one screen) there is no row, and the action is
// rendered where it is written.

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { COLOURS, SIZES } from '@alidade/ui';

/**
 * `undefined`: no App around, render in place. `null`: the App's row is not attached yet, render
 * nothing for that moment. An element: the row.
 */
const PrimaryRowContext = createContext<HTMLElement | null | undefined>(undefined);

export const PrimaryRowProvider = PrimaryRowContext.Provider;

export function PrimaryAction({ children }: { readonly children: ReactNode }) {
  const row = useContext(PrimaryRowContext);
  const content = (
    <div
      data-testid="primary-action"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SIZES.gapPx,
        padding: SIZES.gapPx * 1.5,
        borderTop: `1px solid ${COLOURS.rule}`,
      }}
    >
      {children}
    </div>
  );
  if (row === undefined) return content;
  if (row === null) return null;
  return createPortal(content, row);
}
