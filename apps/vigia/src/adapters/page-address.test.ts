// The Page adapter (Req 1.3, 10.3, design §6): the page's address and fragment, the replacement of
// the address without the fragment, and the change of the fragment.

import { describe, expect, it } from 'vitest';
import { createFakePage } from '../test-support/fake-browser';
import { createPage } from './page-address';

function pageOf(href?: string) {
  const fake = createFakePage(href);
  return { fake, page: createPage(fake.location, fake.history, fake.events) };
}

describe('address and fragment', () => {
  it('address() is the whole address, with query and fragment', () => {
    const { page } = pageOf('https://app.example.test/p?q=1#ABC');
    expect(page.address()).toBe('https://app.example.test/p?q=1#ABC');
  });

  it('fragment() is the text after the # and nothing before it', () => {
    expect(pageOf('https://app.example.test/#ABC-DEF').page.fragment()).toBe('ABC-DEF');
    expect(pageOf('https://app.example.test/').page.fragment()).toBe('');
    expect(pageOf('https://app.example.test/#').page.fragment()).toBe('');
  });

  it('reads the location again each time', () => {
    const { fake, page } = pageOf('https://app.example.test/');
    fake.location.href = 'https://app.example.test/#NEW';
    fake.location.hash = '#NEW';
    expect(page.fragment()).toBe('NEW');
    expect(page.address()).toBe('https://app.example.test/#NEW');
  });
});

describe('replaceAddress (Req 10.3)', () => {
  it('replaces the history entry with the address, no state and no title', () => {
    const { fake, page } = pageOf('https://app.example.test/p?q=1#SECRET');
    page.replaceAddress('https://app.example.test/p?q=1');
    expect(fake.history.calls).toEqual([
      { state: null, unused: '', url: 'https://app.example.test/p?q=1' },
    ]);
  });

  it('never passes a fragment on, even when asked to', () => {
    const { fake, page } = pageOf();
    page.replaceAddress('https://app.example.test/p#SECRET');
    expect(fake.history.calls).toEqual([
      { state: null, unused: '', url: 'https://app.example.test/p' },
    ]);
  });

  it('a history that throws does not throw out of the adapter', () => {
    const { fake, page } = pageOf();
    fake.history.failing = true;
    expect(() => page.replaceAddress('https://app.example.test/')).not.toThrow();
    expect(fake.history.calls).toHaveLength(1);
  });
});

describe('onFragmentChange', () => {
  it('calls the listener on hashchange, and not after it is unsubscribed', () => {
    const { fake, page } = pageOf();
    let heard = 0;
    const off = page.onFragmentChange(() => {
      heard += 1;
    });
    fake.events.dispatch();
    fake.events.dispatch();
    expect(heard).toBe(2);
    off();
    fake.events.dispatch();
    expect(heard).toBe(2);
    expect(fake.events.listeners.size).toBe(0);
  });

  it('a listener that throws does not stop the others', () => {
    const { fake, page } = pageOf();
    let heard = 0;
    page.onFragmentChange(() => {
      throw new Error('bad listener');
    });
    page.onFragmentChange(() => {
      heard += 1;
    });
    expect(() => fake.events.dispatch()).not.toThrow();
    expect(heard).toBe(1);
  });
});
