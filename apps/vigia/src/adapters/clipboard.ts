// The Clipboard adapter (Req 1.3, 10.1, 14.4, design §6): copying text and the phone's share
// sheet. It takes the browser's navigator as an argument and reads no global. Each browser call is
// made as a method of its object, as a browser needs. A browser that has none of it, or refuses,
// gives `clipboard_unavailable` with the error's name; nothing is thrown (Req 2.1).

import { err, ok, type VigiaResult } from '../result';

/** The part of the browser's navigator this adapter uses. */
export interface NavigatorLike {
  readonly clipboard?: { writeText(text: string): Promise<void> } | undefined;
  readonly share?: ((data: { readonly url: string }) => Promise<void>) | undefined;
}

export interface VigiaClipboard {
  copyText(text: string): Promise<VigiaResult<void>>;
  /** Opens the phone's share sheet with the link. `clipboard_unavailable` when there is none. */
  shareLink(link: string): Promise<VigiaResult<void>>;
  /** Whether the browser has a share sheet. */
  readonly canShare: boolean;
}

function failure(error: unknown) {
  const name: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
  return typeof name === 'string' && name !== ''
    ? err('clipboard_unavailable', { errorName: name })
    : err('clipboard_unavailable');
}

export function createClipboard(navigatorLike: NavigatorLike): VigiaClipboard {
  return {
    async copyText(text) {
      const clipboard = navigatorLike.clipboard;
      if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
        return err('clipboard_unavailable');
      }
      try {
        await clipboard.writeText(text);
        return ok(undefined);
      } catch (error) {
        return failure(error);
      }
    },
    async shareLink(link) {
      if (typeof navigatorLike.share !== 'function') return err('clipboard_unavailable');
      try {
        await navigatorLike.share({ url: link });
        return ok(undefined);
      } catch (error) {
        return failure(error);
      }
    },
    get canShare() {
      return typeof navigatorLike.share === 'function';
    },
  };
}
