import { screen } from '@testing-library/react';
import { createContext, useContext, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test-support/render-screen';

const Word = createContext('none');

function Show(): React.JSX.Element {
  return <p>{useContext(Word)}</p>;
}

function Later(): React.JSX.Element {
  const [text, setText] = useState('waiting');
  return (
    <button
      onClick={() => {
        void Promise.resolve().then(() => setText('done'));
      }}
    >
      {text}
    </button>
  );
}

describe('renderScreen (test support)', () => {
  it('renders inside the providers it is given, and not otherwise', () => {
    renderScreen(<Show />, (children) => <Word.Provider value="wrapped">{children}</Word.Provider>);
    expect(screen.getByText('wrapped')).toBeTruthy();
  });

  it('settle runs the action and lets a pending promise finish', async () => {
    const view = renderScreen(<Later />);
    await view.settle(() => screen.getByText('waiting').click());
    expect(screen.getByText('done')).toBeTruthy();
  });
});
