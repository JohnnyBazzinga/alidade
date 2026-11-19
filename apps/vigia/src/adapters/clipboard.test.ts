// The Clipboard adapter (Req 1.3, 10.1, 14.4, design §6): copy and share, with a failure value
// where the browser has no such thing or refuses.

import { describe, expect, it } from 'vitest';
import { createFakeNavigator } from '../test-support/fake-browser';
import { createClipboard } from './clipboard';

describe('copyText', () => {
  it('writes the text to the clipboard, as a method of navigator.clipboard', async () => {
    const navigator = createFakeNavigator();
    const clipboard = createClipboard(navigator);
    expect(await clipboard.copyText('A2B3-C4D5')).toEqual({ ok: true, value: undefined });
    expect(navigator.written).toEqual(['A2B3-C4D5']);
  });

  it('without navigator.clipboard is clipboard_unavailable, and nothing is thrown', async () => {
    const clipboard = createClipboard(createFakeNavigator({ clipboard: 'absent' }));
    expect(await clipboard.copyText('x')).toEqual({ ok: false, reason: 'clipboard_unavailable' });
  });

  it('with a clipboard that rejects is clipboard_unavailable with the error name', async () => {
    const clipboard = createClipboard(createFakeNavigator({ clipboard: 'reject' }));
    expect(await clipboard.copyText('x')).toEqual({
      ok: false,
      reason: 'clipboard_unavailable',
      errorName: 'NotAllowedError',
    });
  });

  it('with a clipboard that throws at once is a failure value too', async () => {
    const clipboard = createClipboard(createFakeNavigator({ clipboard: 'throw' }));
    expect(await clipboard.copyText('x')).toEqual({
      ok: false,
      reason: 'clipboard_unavailable',
      errorName: 'SecurityError',
    });
  });

  it('copies any text as it is, the empty one and a long one included', async () => {
    const navigator = createFakeNavigator();
    const clipboard = createClipboard(navigator);
    const long = 'Z'.repeat(10_000);
    await clipboard.copyText('');
    await clipboard.copyText(long);
    expect(navigator.written).toEqual(['', long]);
  });

  it('a navigator whose clipboard has no writeText is clipboard_unavailable', async () => {
    const clipboard = createClipboard({ clipboard: {} as never });
    expect(await clipboard.copyText('x')).toEqual({ ok: false, reason: 'clipboard_unavailable' });
  });
});

describe('shareLink and canShare', () => {
  it('shares the link as the url of the share data, as a method of navigator', async () => {
    const navigator = createFakeNavigator();
    const clipboard = createClipboard(navigator);
    expect(clipboard.canShare).toBe(true);
    expect(await clipboard.shareLink('https://app.example.test/#ABC')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(navigator.shared).toEqual(['https://app.example.test/#ABC']);
  });

  it('without navigator.share, canShare is false and shareLink is clipboard_unavailable', async () => {
    const navigator = createFakeNavigator({ share: 'absent' });
    const clipboard = createClipboard(navigator);
    expect(clipboard.canShare).toBe(false);
    expect(await clipboard.shareLink('x')).toEqual({ ok: false, reason: 'clipboard_unavailable' });
    expect(navigator.shared).toEqual([]);
  });

  it('a share that rejects (the user cancelled) keeps its error name in the failure', async () => {
    const clipboard = createClipboard(createFakeNavigator({ share: 'reject' }));
    expect(await clipboard.shareLink('x')).toEqual({
      ok: false,
      reason: 'clipboard_unavailable',
      errorName: 'AbortError',
    });
  });

  it('a share that throws at once is a failure value', async () => {
    const clipboard = createClipboard(createFakeNavigator({ share: 'throw' }));
    expect(await clipboard.shareLink('x')).toMatchObject({
      ok: false,
      reason: 'clipboard_unavailable',
    });
  });

  it('the clipboard and the share sheet are independent', async () => {
    const noShare = createClipboard(createFakeNavigator({ share: 'absent' }));
    expect((await noShare.copyText('x')).ok).toBe(true);
    const noClipboard = createClipboard(createFakeNavigator({ clipboard: 'absent' }));
    expect((await noClipboard.shareLink('x')).ok).toBe(true);
  });
});
