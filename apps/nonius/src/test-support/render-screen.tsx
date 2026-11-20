// Renders a screen inside the providers a test hands it (test support, not exported). The
// providers of the app's own environment and store are added in task group 9 through `wrap`;
// until then a test wraps with what it needs. `settle` lets pending promises (a location, a
// storage write) finish inside `act`.

import { act, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export interface RenderedScreen extends ReturnType<typeof render> {
  settle(fn?: () => void): Promise<void>;
}

export function renderScreen(
  ui: ReactElement,
  wrap: (children: ReactNode) => ReactElement = (children) => <>{children}</>,
): RenderedScreen {
  const utils = render(wrap(ui));
  const settle = async (fn: () => void = () => undefined): Promise<void> => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  return { ...utils, settle };
}
