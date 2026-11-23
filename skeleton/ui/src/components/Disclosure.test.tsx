// The disclosure (Req 22.9, design D37.8, task 35.5): a `details` whose summary is a row of at least
// 48 with its label and a chevron that says its state, down while closed and up while open, never
// a chevron-right (which is a row that opens another view). Every `details` of the package uses it.

import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Disclosure } from './Disclosure';

function chevron(summary: Element | null): string | null {
  return summary?.querySelector('svg')?.getAttribute('data-icon') ?? null;
}

describe('Disclosure (Req 22.9)', () => {
  it('shows a chevron-down while closed and a chevron-up while open, read after a toggle event', () => {
    const { container } = render(
      <Disclosure summary="Why this accuracy?" testId="why">
        <p>Made of three parts.</p>
      </Disclosure>,
    );
    const details = container.querySelector('details') as HTMLDetailsElement;
    const summary = details.querySelector('summary');
    expect(details.open).toBe(false);
    expect(chevron(summary)).toBe('chevron-down');
    act(() => {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    });
    expect(chevron(details.querySelector('summary'))).toBe('chevron-up');
    act(() => {
      details.open = false;
      fireEvent(details, new Event('toggle'));
    });
    expect(chevron(details.querySelector('summary'))).toBe('chevron-down');
  });

  it('starts open when asked, with a chevron-up', () => {
    const { container } = render(
      <Disclosure summary="Details" open>
        <p>x</p>
      </Disclosure>,
    );
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true);
    expect(chevron(container.querySelector('summary'))).toBe('chevron-up');
  });

  it('has a summary of at least 48 with its label, and never a chevron-right', () => {
    const { container, getByText } = render(
      <Disclosure summary="Details" part="details">
        <p>Inside</p>
      </Disclosure>,
    );
    const summary = container.querySelector('summary') as HTMLElement;
    expect(Number.parseFloat(summary.style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(summary.textContent).toBe('Details');
    expect(container.querySelector('[data-icon="chevron-right"]')).toBeNull();
    // The marker is drawn: a summary laid out as a row draws its own chevron.
    expect(summary.querySelector('svg')).not.toBeNull();
    // What is inside is on the page, for a test and a reader of the markup.
    expect(getByText('Inside')).toBeDefined();
    expect(container.querySelector('details')?.getAttribute('data-part')).toBe('details');
  });

  it('keeps the label at the start and the chevron at the end of the row', () => {
    const { container } = render(
      <Disclosure summary="Details">
        <p>x</p>
      </Disclosure>,
    );
    const summary = container.querySelector('summary') as HTMLElement;
    expect(summary.style.display).toBe('flex');
    expect(summary.style.justifyContent).toBe('space-between');
    expect(summary.lastElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('framed: a bordered card for an app that lists disclosures among cards', () => {
    const { container } = render(
      <Disclosure summary="Other ways" framed testId="other">
        <p>x</p>
      </Disclosure>,
    );
    const details = container.querySelector('details') as HTMLElement;
    expect(details.style.border).toBe('1px solid var(--alidade-rule)');
    expect(details.style.background).toBe('var(--alidade-card)');
    expect(details.style.borderRadius).toBe('var(--alidade-button-radius)');
  });
});

const GLOBBED = import.meta.glob<string>('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('every disclosure of the package uses Disclosure (Req 22.9)', () => {
  const sources = Object.entries(GLOBBED)
    .map(([key, source]) => [new URL(key, import.meta.url).pathname, source] as const)
    .filter(([path]) => !/\.test\.tsx$/.test(path));

  it('reads the source', () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  it('has no details element outside Disclosure.tsx', () => {
    const found = sources
      .filter(([path]) => !path.endsWith('/components/Disclosure.tsx'))
      .filter(([, source]) => /<details\b/.test(source))
      .map(([path]) => path.replace(/^.*\/src\//, 'src/'));
    expect(found).toEqual([]);
  });
});
